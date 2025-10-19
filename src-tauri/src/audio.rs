use anyhow::{anyhow, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Host, Stream, StreamConfig};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

/// Represents an audio recording session
pub struct AudioRecorder {
    buffer: Arc<Mutex<Vec<i16>>>,
    sample_rate: Arc<Mutex<u32>>,
    is_recording: Arc<Mutex<bool>>,
    stream_id: Arc<Mutex<u64>>, // Counter to identify current stream
}

/// Information about an audio device
#[derive(serde::Serialize, Clone)]
pub struct AudioDeviceInfo {
    pub name: String,
    pub index: usize,
    pub is_default: bool,
}

impl AudioRecorder {
    pub fn new() -> Self {
        Self {
            buffer: Arc::new(Mutex::new(Vec::new())),
            sample_rate: Arc::new(Mutex::new(16000)), // Default, will be updated when recording starts
            is_recording: Arc::new(Mutex::new(false)),
            stream_id: Arc::new(Mutex::new(0)),
        }
    }

    /// Get list of available input devices
    pub fn get_input_devices() -> Result<Vec<AudioDeviceInfo>> {
        let host = cpal::default_host();
        let default_device = host.default_input_device();
        let default_name = default_device.as_ref().and_then(|d| d.name().ok());

        let devices: Vec<AudioDeviceInfo> = host
            .input_devices()?
            .enumerate()
            .filter_map(|(index, device)| {
                device.name().ok().map(|name| {
                    let is_default = default_name.as_ref() == Some(&name);
                    AudioDeviceInfo {
                        name,
                        index,
                        is_default,
                    }
                })
            })
            .collect();

        if devices.is_empty() {
            return Err(anyhow!("No input devices found"));
        }

        Ok(devices)
    }

    /// Start recording from the specified device (or default if None)
    pub fn start_recording<R: tauri::Runtime>(
        &mut self,
        device_index: Option<usize>,
        app_handle: tauri::AppHandle<R>,
    ) -> Result<()> {
        println!("start_recording called with device_index: {:?}", device_index);

        // Increment stream ID to invalidate old streams
        {
            let mut stream_id = self.stream_id.lock().unwrap();
            *stream_id = stream_id.wrapping_add(1);
            println!("New stream ID: {}", *stream_id);
        }

        // Set recording flag to false briefly to stop old streams
        *self.is_recording.lock().unwrap() = false;
        std::thread::sleep(std::time::Duration::from_millis(50)); // Give time for old callbacks to stop

        // Clear previous buffer
        {
            let mut buffer = self.buffer.lock().unwrap();
            buffer.clear();
        }

        let host = cpal::default_host();
        let device = self.get_device(&host, device_index)?;

        // Log device name
        if let Ok(name) = device.name() {
            println!("Using audio device: {}", name);
        }

        // Get the default input config
        let default_config = device
            .default_input_config()
            .map_err(|e| anyhow!("Failed to get default input config: {}", e))?;

        let sample_format = default_config.sample_format();
        let device_sample_rate = default_config.sample_rate().0;
        println!("Device default: format={:?}, sample_rate={}, channels={}",
                 sample_format, device_sample_rate, default_config.channels());

        // Use the device's native sample rate for compatibility
        // Whisper works well with various sample rates (16000, 44100, 48000, etc.)
        let config: StreamConfig = default_config.into();

        println!("Using device native config: sample_rate={}, channels={}",
                 config.sample_rate.0, config.channels);

        // Store the actual sample rate we're using
        *self.sample_rate.lock().unwrap() = config.sample_rate.0;

        // Clone Arc references for the closure
        let buffer = self.buffer.clone();
        let is_recording = self.is_recording.clone();
        let stream_id = self.stream_id.clone();

        // Get current stream ID for this stream
        let current_stream_id = *stream_id.lock().unwrap();

        // Set recording flag
        *is_recording.lock().unwrap() = true;

        // Build the input stream
        let stream = match sample_format {
            cpal::SampleFormat::I16 => self.build_input_stream::<i16, R>(
                &device,
                &config,
                buffer.clone(),
                is_recording.clone(),
                stream_id.clone(),
                current_stream_id,
                app_handle,
            )?,
            cpal::SampleFormat::U16 => self.build_input_stream::<u16, R>(
                &device,
                &config,
                buffer.clone(),
                is_recording.clone(),
                stream_id.clone(),
                current_stream_id,
                app_handle,
            )?,
            cpal::SampleFormat::F32 => self.build_input_stream::<f32, R>(
                &device,
                &config,
                buffer.clone(),
                is_recording.clone(),
                stream_id.clone(),
                current_stream_id,
                app_handle,
            )?,
            _ => return Err(anyhow!("Unsupported sample format: {:?}", sample_format)),
        };

        stream.play()?;

        // Keep the stream alive by leaking it
        // Old streams will stop automatically because they check the stream_id
        std::mem::forget(stream);

        Ok(())
    }

    /// Stop recording and return the captured audio data with sample rate
    pub fn stop_recording(&mut self) -> Result<(Vec<i16>, u32)> {
        // Set recording flag to false - this will stop the stream callback
        *self.is_recording.lock().unwrap() = false;

        // Wait a bit for the stream to stop
        std::thread::sleep(std::time::Duration::from_millis(50));

        // Get the buffer data
        let mut buffer = self.buffer.lock().unwrap();
        let audio_data: Vec<i16> = buffer.drain(..).collect();

        // Get the sample rate
        let sample_rate = *self.sample_rate.lock().unwrap();

        println!("stop_recording: captured {} samples at {} Hz", audio_data.len(), sample_rate);

        Ok((audio_data, sample_rate))
    }

    /// Check if currently recording
    pub fn is_recording(&self) -> bool {
        *self.is_recording.lock().unwrap()
    }

    /// Get the appropriate device
    fn get_device(&self, host: &Host, device_index: Option<usize>) -> Result<Device> {
        if let Some(idx) = device_index {
            host.input_devices()?
                .nth(idx)
                .ok_or_else(|| anyhow!("Invalid device index"))
        } else {
            host.default_input_device()
                .ok_or_else(|| anyhow!("No default input device found"))
        }
    }

    /// Build input stream for a specific sample format
    fn build_input_stream<T, R: tauri::Runtime>(
        &self,
        device: &Device,
        config: &StreamConfig,
        buffer: Arc<Mutex<Vec<i16>>>,
        is_recording: Arc<Mutex<bool>>,
        stream_id: Arc<Mutex<u64>>,
        my_stream_id: u64,
        app_handle: tauri::AppHandle<R>,
    ) -> Result<Stream>
    where
        T: cpal::Sample + cpal::SizedSample,
        i16: cpal::FromSample<T>,
    {
        let channels = config.channels as usize;
        let err_fn = |err| eprintln!("Audio stream error: {}", err);

        let stream = device.build_input_stream(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                // Check if this stream is still the active one
                if *stream_id.lock().unwrap() != my_stream_id {
                    return; // This stream has been superseded, ignore callback
                }

                if !*is_recording.lock().unwrap() {
                    return;
                }

                // Convert samples to i16 and mix channels to mono
                let samples: Vec<i16> = if channels == 1 {
                    // Mono: direct conversion
                    data.iter()
                        .map(|&sample| sample.to_sample::<i16>())
                        .collect()
                } else {
                    // Stereo/Multi-channel: mix all channels by averaging
                    data.chunks_exact(channels)
                        .map(|chunk| {
                            let sum: i32 = chunk.iter()
                                .map(|&s| s.to_sample::<i16>() as i32)
                                .sum();
                            (sum / channels as i32) as i16
                        })
                        .collect()
                };

                // Debug: log first few samples on first callback
                static FIRST_LOG: std::sync::Once = std::sync::Once::new();
                FIRST_LOG.call_once(|| {
                    println!("First 10 i16 samples: {:?}", &samples[..samples.len().min(10)]);
                });

                // Calculate RMS for visualization
                let rms = calculate_rms(&samples);

                // Normalize to 0-1 range with MUCH more amplification for typical speech levels
                // Typical speech RMS is around 0.01-0.05, so we need 20-50x amplification
                let normalized_level = (rms * 50.0).min(1.0);

                // Store in buffer
                {
                    let mut buf = buffer.lock().unwrap();
                    buf.extend_from_slice(&samples);
                }

                // Emit audio level event for visualization
                let _ = app_handle.emit("audio-level", normalized_level);
            },
            err_fn,
            None,
        )?;

        Ok(stream)
    }
}

/// Calculate Root Mean Square (RMS) of audio samples for visualization
fn calculate_rms(samples: &[i16]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }

    let sum: f64 = samples
        .iter()
        .map(|&s| {
            let normalized = s as f64 / 32768.0;
            normalized * normalized
        })
        .sum();

    (sum / samples.len() as f64).sqrt() as f32
}
