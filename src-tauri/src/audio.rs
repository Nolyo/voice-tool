use anyhow::{anyhow, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Host, Stream, StreamConfig};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

/// Represents an audio recording session
pub struct AudioRecorder {
    buffer: Arc<Mutex<Vec<i16>>>,
    stream: Option<Stream>,
    sample_rate: u32,
    is_recording: Arc<Mutex<bool>>,
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
            stream: None,
            sample_rate: 16000, // Standard for speech recognition
            is_recording: Arc::new(Mutex::new(false)),
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
        // Clear previous buffer
        {
            let mut buffer = self.buffer.lock().unwrap();
            buffer.clear();
        }

        let host = cpal::default_host();
        let device = self.get_device(&host, device_index)?;

        // Get the default input config
        let config = device
            .default_input_config()
            .map_err(|e| anyhow!("Failed to get default input config: {}", e))?;

        println!("Using audio config: {:?}", config);

        let sample_format = config.sample_format();
        let config: StreamConfig = config.into();

        // Clone Arc references for the closure
        let buffer = self.buffer.clone();
        let is_recording = self.is_recording.clone();

        // Set recording flag
        *is_recording.lock().unwrap() = true;

        // Build the input stream
        let stream = match sample_format {
            cpal::SampleFormat::I16 => self.build_input_stream::<i16>(
                &device,
                &config,
                buffer.clone(),
                is_recording.clone(),
                app_handle,
            )?,
            cpal::SampleFormat::U16 => self.build_input_stream::<u16>(
                &device,
                &config,
                buffer.clone(),
                is_recording.clone(),
                app_handle,
            )?,
            cpal::SampleFormat::F32 => self.build_input_stream::<f32>(
                &device,
                &config,
                buffer.clone(),
                is_recording.clone(),
                app_handle,
            )?,
            _ => return Err(anyhow!("Unsupported sample format: {:?}", sample_format)),
        };

        stream.play()?;
        self.stream = Some(stream);

        Ok(())
    }

    /// Stop recording and return the captured audio data
    pub fn stop_recording(&mut self) -> Result<Vec<i16>> {
        // Stop the stream
        if let Some(stream) = self.stream.take() {
            drop(stream);
        }

        // Set recording flag to false
        *self.is_recording.lock().unwrap() = false;

        // Get the buffer data
        let mut buffer = self.buffer.lock().unwrap();
        let audio_data = buffer.drain(..).collect();

        Ok(audio_data)
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
        app_handle: tauri::AppHandle<R>,
    ) -> Result<Stream>
    where
        T: cpal::Sample + cpal::SizedSample,
    {
        let channels = config.channels as usize;
        let err_fn = |err| eprintln!("Audio stream error: {}", err);

        let stream = device.build_input_stream(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                if !*is_recording.lock().unwrap() {
                    return;
                }

                // Convert samples to i16 and store in buffer
                let samples: Vec<i16> = data
                    .iter()
                    .step_by(channels) // Take only first channel if stereo
                    .map(|sample| sample.to_i16())
                    .collect();

                // Calculate RMS for visualization
                let rms = calculate_rms(&samples);

                // Store in buffer
                {
                    let mut buf = buffer.lock().unwrap();
                    buf.extend_from_slice(&samples);
                }

                // Emit audio level event for visualization
                let _ = app_handle.emit("audio-level", rms);
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
