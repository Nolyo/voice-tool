//! Real-time speech segmentation for streaming transcription.
//!
//! While a streaming session is active, the audio callback feeds mono i16
//! samples into a worker thread that runs a [`SpeechSegmenter`]: a pure state
//! machine that cuts the live signal into segments at natural pauses. Each
//! segment is shipped to the renderer as a `streaming-chunk` event and
//! transcribed through the regular cloud pipeline while the user keeps
//! talking.
//!
//! The detector shares its philosophy with `audio_trim`: fixed 20 ms RMS
//! windows and an adaptive threshold derived from the running peak RMS of the
//! session (10% of peak, clamped), so it is robust to mic gain and distance.
//! Segmentation rules:
//!
//! - a cut happens after `silence_gap_ms` of continuous silence, but never
//!   before the segment reaches `min_segment_ms`;
//! - a segment that reaches `max_segment_ms` without a pause is force-cut at
//!   the quietest 20 ms window of the last `force_cut_lookback_ms` (best
//!   effort to avoid slicing a word in half), the remainder carries over;
//! - `tail_padding_ms` of trailing silence is kept on each cut, and up to
//!   `pre_roll_ms` of leading silence is kept before the first speech window
//!   (attack), so no speech sample is ever dropped — only pure silence is;
//! - segments with fewer than two speech windows are discarded (click guard,
//!   same rationale as `audio_trim`), and pure silence never leaves the
//!   segmenter: memory stays bounded during long pauses.

use crate::audio_trim::rms;

pub struct SegmenterConfig {
    pub sample_rate: u32,
    pub window_ms: u32,
    /// Continuous silence that triggers a cut.
    pub silence_gap_ms: u32,
    /// No silence-cut before the segment reaches this duration.
    pub min_segment_ms: u32,
    /// Force cut at this duration even without a pause.
    pub max_segment_ms: u32,
    /// Search window (from the end) for the quietest force-cut point.
    pub force_cut_lookback_ms: u32,
    /// Trailing silence kept on a silence-cut.
    pub tail_padding_ms: u32,
    /// Leading silence kept before the first speech window of a segment.
    pub pre_roll_ms: u32,
    /// Speech threshold as a fraction of the running peak window RMS.
    pub threshold_fraction: f32,
    pub min_threshold: f32,
    pub max_threshold: f32,
    /// Below this running peak, the signal is too weak to contain speech.
    pub noise_floor_peak: f32,
}

impl SegmenterConfig {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            window_ms: 20,
            silence_gap_ms: 600,
            min_segment_ms: 1400,
            max_segment_ms: 15_000,
            force_cut_lookback_ms: 2_000,
            tail_padding_ms: 250,
            pre_roll_ms: 250,
            threshold_fraction: 0.10,
            min_threshold: 0.004,
            max_threshold: 0.020,
            noise_floor_peak: 0.010,
        }
    }
}

/// A contiguous run of audio containing speech, ready for transcription.
pub struct Segment {
    pub samples: Vec<i16>,
    pub start_ms: u64,
    pub end_ms: u64,
}

pub struct SpeechSegmenter {
    config: SegmenterConfig,
    /// Samples per RMS window.
    window_size: usize,
    /// Incoming samples not yet forming a complete window.
    pending: Vec<i16>,
    /// Current segment under construction.
    buffer: Vec<i16>,
    /// Absolute sample index of `buffer[0]` since session start.
    buffer_start_sample: u64,
    /// Absolute samples processed (whole windows only).
    total_samples: u64,
    peak_rms: f32,
    has_speech: bool,
    speech_windows: u32,
    silence_run_ms: u32,
}

impl SpeechSegmenter {
    pub fn new(config: SegmenterConfig) -> Self {
        let window_size =
            ((config.sample_rate as u64 * config.window_ms as u64) / 1000).max(1) as usize;
        Self {
            config,
            window_size,
            pending: Vec::new(),
            buffer: Vec::new(),
            buffer_start_sample: 0,
            total_samples: 0,
            peak_rms: 0.0,
            has_speech: false,
            speech_windows: 0,
            silence_run_ms: 0,
        }
    }

    /// Feed a batch of mono i16 samples; returns 0..n completed segments.
    pub fn push(&mut self, samples: &[i16]) -> Vec<Segment> {
        self.pending.extend_from_slice(samples);
        let ws = self.window_size;
        let full_windows = self.pending.len() / ws;
        if full_windows == 0 {
            return Vec::new();
        }
        let drained: Vec<i16> = self.pending.drain(..full_windows * ws).collect();

        let mut out = Vec::new();
        for window in drained.chunks_exact(ws) {
            if let Some(segment) = self.process_window(window) {
                out.push(segment);
            }
        }
        out
    }

    /// End of stream: returns the trailing segment if it contains speech.
    pub fn flush(&mut self) -> Option<Segment> {
        // Fold the incomplete trailing window into the buffer when it belongs
        // to an active utterance; otherwise it is silence-adjacent noise.
        if self.has_speech && !self.pending.is_empty() {
            let pending = std::mem::take(&mut self.pending);
            self.buffer.extend_from_slice(&pending);
            self.total_samples += pending.len() as u64;
        } else {
            self.pending.clear();
        }

        let segment = if self.has_speech && self.speech_windows >= 2 {
            let start_sample = self.buffer_start_sample;
            let len = self.buffer.len() as u64;
            Some(Segment {
                samples: std::mem::take(&mut self.buffer),
                start_ms: self.sample_to_ms(start_sample),
                end_ms: self.sample_to_ms(start_sample + len),
            })
        } else {
            None
        };
        self.reset_buffer();
        segment
    }

    fn process_window(&mut self, window: &[i16]) -> Option<Segment> {
        let window_start_sample = self.total_samples;
        self.total_samples += window.len() as u64;
        if self.buffer.is_empty() {
            self.buffer_start_sample = window_start_sample;
        }

        let r = rms(window);
        if r > self.peak_rms {
            self.peak_rms = r;
        }
        let threshold = (self.peak_rms * self.config.threshold_fraction)
            .clamp(self.config.min_threshold, self.config.max_threshold);
        let is_speech = self.peak_rms >= self.config.noise_floor_peak && r > threshold;

        if is_speech {
            self.buffer.extend_from_slice(window);
            self.has_speech = true;
            self.speech_windows += 1;
            self.silence_run_ms = 0;
        } else if self.has_speech {
            self.buffer.extend_from_slice(window);
            self.silence_run_ms += self.config.window_ms;
        } else {
            // No speech yet: keep only a bounded pre-roll of leading silence
            // so the eventual segment preserves the attack of the first word.
            self.buffer.extend_from_slice(window);
            let max_pre_roll = self.ms_to_samples(self.config.pre_roll_ms);
            if self.buffer.len() > max_pre_roll {
                let excess = self.buffer.len() - max_pre_roll;
                self.buffer.drain(..excess);
                self.buffer_start_sample += excess as u64;
            }
            return None;
        }

        let segment_ms = self.sample_len_ms(self.buffer.len());
        if self.has_speech
            && self.silence_run_ms >= self.config.silence_gap_ms
            && segment_ms >= self.config.min_segment_ms as u64
        {
            return self.cut_at_silence();
        }
        if self.has_speech && segment_ms >= self.config.max_segment_ms as u64 {
            return self.force_cut();
        }
        None
    }

    /// Cut after a natural pause: keep `tail_padding_ms` of the trailing
    /// silence, drop the rest of it (next segment starts fresh).
    fn cut_at_silence(&mut self) -> Option<Segment> {
        let silence_samples = self.ms_to_samples(self.silence_run_ms);
        let keep_tail = self.ms_to_samples(self.config.tail_padding_ms);
        let drop_len = silence_samples
            .saturating_sub(keep_tail)
            .min(self.buffer.len());
        let cut_len = self.buffer.len() - drop_len;

        let segment = if self.speech_windows >= 2 && cut_len > 0 {
            Some(Segment {
                samples: self.buffer[..cut_len].to_vec(),
                start_ms: self.sample_to_ms(self.buffer_start_sample),
                end_ms: self.sample_to_ms(self.buffer_start_sample + cut_len as u64),
            })
        } else {
            None // click guard: too little speech to be worth a request
        };
        self.reset_buffer();
        segment
    }

    /// Force cut a too-long segment at the quietest window of the lookback
    /// range; the remainder carries over as the start of the next segment.
    fn force_cut(&mut self) -> Option<Segment> {
        let ws = self.window_size;
        let lookback = self
            .ms_to_samples(self.config.force_cut_lookback_ms)
            .min(self.buffer.len());
        let search_start = self.buffer.len() - lookback;

        let mut best_idx = self.buffer.len().saturating_sub(ws);
        let mut best_rms = f32::MAX;
        let mut i = search_start;
        while i + ws <= self.buffer.len() {
            let r = rms(&self.buffer[i..i + ws]);
            if r < best_rms {
                best_rms = r;
                best_idx = i;
            }
            i += ws;
        }
        // Cut in the middle of the quietest window.
        let cut_at = (best_idx + ws / 2).min(self.buffer.len());

        let segment = if self.speech_windows >= 2 && cut_at > 0 {
            Some(Segment {
                samples: self.buffer[..cut_at].to_vec(),
                start_ms: self.sample_to_ms(self.buffer_start_sample),
                end_ms: self.sample_to_ms(self.buffer_start_sample + cut_at as u64),
            })
        } else {
            None
        };

        // Carry the remainder over: we are mid-speech by construction.
        let carry: Vec<i16> = self.buffer[cut_at..].to_vec();
        let carry_len = carry.len() as u64;
        self.buffer = carry;
        self.buffer_start_sample = self.total_samples - carry_len;
        self.has_speech = !self.buffer.is_empty();
        self.speech_windows = if self.buffer.is_empty() { 0 } else { 1 };
        self.silence_run_ms = 0;
        segment
    }

    fn reset_buffer(&mut self) {
        self.buffer.clear();
        self.buffer_start_sample = self.total_samples;
        self.has_speech = false;
        self.speech_windows = 0;
        self.silence_run_ms = 0;
    }

    fn ms_to_samples(&self, ms: u32) -> usize {
        (self.config.sample_rate as u64 * ms as u64 / 1000) as usize
    }

    fn sample_to_ms(&self, sample_index: u64) -> u64 {
        sample_index * 1000 / self.config.sample_rate as u64
    }

    fn sample_len_ms(&self, len: usize) -> u64 {
        len as u64 * 1000 / self.config.sample_rate as u64
    }

    #[cfg(test)]
    pub fn buffered_len(&self) -> usize {
        self.buffer.len() + self.pending.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    const SR: u32 = 48_000;

    fn silence(duration_ms: u32) -> Vec<i16> {
        let n = (SR as u64 * duration_ms as u64 / 1000) as usize;
        vec![0i16; n]
    }

    /// Loud sine wave (~0.28 RMS, far above the 0.020 clamped threshold).
    fn speech(duration_ms: u32) -> Vec<i16> {
        let n = (SR as u64 * duration_ms as u64 / 1000) as usize;
        let amplitude = (i16::MAX as f32) * 0.4;
        (0..n)
            .map(|i| {
                let t = i as f32 / SR as f32;
                (amplitude * (2.0 * PI * 440.0 * t).sin()) as i16
            })
            .collect()
    }

    fn feed(seg: &mut SpeechSegmenter, parts: &[&[i16]]) -> Vec<Segment> {
        let mut out = Vec::new();
        for p in parts {
            out.extend(seg.push(p));
        }
        out
    }

    fn seg_ms(s: &Segment) -> u64 {
        s.samples.len() as u64 * 1000 / SR as u64
    }

    #[test]
    fn cuts_at_natural_pause() {
        let mut seg = SpeechSegmenter::new(SegmenterConfig::new(SR));
        let mut out = feed(&mut seg, &[&speech(3000), &silence(1000), &speech(2000)]);
        if let Some(tail) = seg.flush() {
            out.push(tail);
        }
        assert_eq!(out.len(), 2, "expected one silence-cut + one flush segment");
        // First segment: 3s speech + ~250ms tail padding
        assert!(
            out[0].end_ms >= 3000 && out[0].end_ms <= 3600,
            "first segment should end just after the speech, got end_ms={}",
            out[0].end_ms
        );
        // Second segment holds the last 2s of speech
        assert!(
            seg_ms(&out[1]) >= 1900,
            "second segment too short: {}ms",
            seg_ms(&out[1])
        );
    }

    #[test]
    fn no_cut_before_min_duration() {
        let mut seg = SpeechSegmenter::new(SegmenterConfig::new(SR));
        // 500ms speech + 700ms silence: the gap exceeds silence_gap_ms but the
        // segment is still under min_segment_ms, so no cut may happen.
        let mut out = feed(&mut seg, &[&speech(500), &silence(700), &speech(1000)]);
        if let Some(tail) = seg.flush() {
            out.push(tail);
        }
        assert_eq!(out.len(), 1, "min_segment_ms must prevent an early cut");
        assert!(
            seg_ms(&out[0]) >= 2000,
            "single segment should span both utterances, got {}ms",
            seg_ms(&out[0])
        );
    }

    #[test]
    fn pure_silence_emits_nothing() {
        let mut seg = SpeechSegmenter::new(SegmenterConfig::new(SR));
        let out = feed(&mut seg, &[&silence(10_000)]);
        assert!(out.is_empty());
        assert!(seg.flush().is_none());
    }

    #[test]
    fn isolated_click_discarded() {
        let mut seg = SpeechSegmenter::new(SegmenterConfig::new(SR));
        let mut out = feed(&mut seg, &[&silence(2000), &speech(20), &silence(2000)]);
        if let Some(tail) = seg.flush() {
            out.push(tail);
        }
        assert!(
            out.is_empty(),
            "a single 20ms blip must never produce a segment"
        );
    }

    #[test]
    fn force_cut_on_long_speech() {
        let mut seg = SpeechSegmenter::new(SegmenterConfig::new(SR));
        let mut out = feed(&mut seg, &[&speech(20_000)]);
        assert!(
            !out.is_empty(),
            "20s of continuous speech must force-cut before flush"
        );
        if let Some(tail) = seg.flush() {
            out.push(tail);
        }
        for s in &out {
            assert!(
                seg_ms(s) <= 15_500,
                "no segment may exceed max_segment_ms (+tolerance), got {}ms",
                seg_ms(s)
            );
        }
    }

    #[test]
    fn speech_is_contiguous_across_cuts() {
        let mut seg = SpeechSegmenter::new(SegmenterConfig::new(SR));
        let speech_fed: usize = 5 * SR as usize; // 3s + 2s
        let mut out = feed(&mut seg, &[&speech(3000), &silence(1000), &speech(2000)]);
        if let Some(tail) = seg.flush() {
            out.push(tail);
        }
        let total: usize = out.iter().map(|s| s.samples.len()).sum();
        assert!(
            total >= speech_fed,
            "segments must retain all speech samples: kept {} of {}",
            total,
            speech_fed
        );
    }

    #[test]
    fn flush_returns_short_tail() {
        let mut seg = SpeechSegmenter::new(SegmenterConfig::new(SR));
        let out = feed(&mut seg, &[&speech(3000), &silence(1000), &speech(600)]);
        assert_eq!(out.len(), 1, "the pause should have cut the first segment");
        let tail = seg.flush();
        assert!(
            tail.is_some(),
            "a short trailing utterance must not be lost at flush"
        );
        assert!(seg_ms(&tail.unwrap()) >= 500);
    }

    #[test]
    fn long_pause_bounded_memory() {
        let mut seg = SpeechSegmenter::new(SegmenterConfig::new(SR));
        let batch = silence(500);
        for _ in 0..120 {
            // 60s of silence
            let out = seg.push(&batch);
            assert!(out.is_empty());
        }
        let max_pre_roll = (SR as u64 * 250 / 1000) as usize; // pre_roll_ms
        let one_window = (SR as u64 * 20 / 1000) as usize;
        assert!(
            seg.buffered_len() <= max_pre_roll + one_window,
            "silence must stay bounded to the pre-roll: buffered {} samples",
            seg.buffered_len()
        );
    }
}
