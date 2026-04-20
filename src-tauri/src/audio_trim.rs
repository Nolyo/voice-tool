//! Silence trimming for recorded audio.
//!
//! Removes leading and trailing silence before transcription so Whisper
//! (cloud or local) receives tighter input, reducing hallucinations on
//! empty leading/trailing segments and saving a few API cents.
//!
//! The algorithm scans the signal by fixed-size windows (~20 ms), flags
//! a window as "speech" when its RMS is above `RMS_THRESHOLD`, and
//! requires two consecutive speech windows to mark the start/end of
//! speech (guards against isolated clicks). A symmetric padding of
//! `PADDING_MS` is kept on each side so the attack of consonants like
//! P/T/K is never chopped.
//!
//! Safety rails: if trimming would leave less than `MIN_OUTPUT_MS` of
//! audio, or would cut more than `MAX_TRIM_RATIO` of the signal, or if
//! no speech is detected at all, the original samples are returned
//! untouched.

const RMS_THRESHOLD: f32 = 0.015;
const WINDOW_MS: u32 = 20;
const PADDING_MS: u32 = 300;
const MIN_OUTPUT_MS: u32 = 500;
const MAX_TRIM_RATIO: f32 = 0.80;

pub struct TrimResult {
    pub samples: Vec<i16>,
    pub trimmed_start_ms: u32,
    pub trimmed_end_ms: u32,
}

pub fn trim_silence(samples: &[i16], sample_rate: u32) -> TrimResult {
    if samples.is_empty() || sample_rate == 0 {
        return passthrough(samples);
    }

    let window_size = ((sample_rate as u64 * WINDOW_MS as u64) / 1000) as usize;
    if window_size == 0 {
        return passthrough(samples);
    }

    let num_windows = samples.len() / window_size;
    if num_windows < 2 {
        return passthrough(samples);
    }

    let first = find_first_speech_window(samples, window_size, num_windows);
    let last = find_last_speech_window(samples, window_size, num_windows);

    let (first_win, last_win) = match (first, last) {
        (Some(f), Some(l)) if l >= f => (f, l),
        _ => return passthrough(samples),
    };

    let start_sample = first_win * window_size;
    let end_sample = ((last_win + 1) * window_size).min(samples.len());

    let padding_samples = ((sample_rate as u64 * PADDING_MS as u64) / 1000) as usize;
    let start_trimmed = start_sample.saturating_sub(padding_samples);
    let end_trimmed = (end_sample + padding_samples).min(samples.len());

    let output_len = end_trimmed.saturating_sub(start_trimmed);
    let min_output_samples = ((sample_rate as u64 * MIN_OUTPUT_MS as u64) / 1000) as usize;
    if output_len < min_output_samples {
        return passthrough(samples);
    }

    let trim_ratio = 1.0 - (output_len as f32 / samples.len() as f32);
    if trim_ratio > MAX_TRIM_RATIO {
        return passthrough(samples);
    }

    let trimmed_start_ms = samples_to_ms(start_trimmed, sample_rate);
    let trimmed_end_ms = samples_to_ms(samples.len() - end_trimmed, sample_rate);

    TrimResult {
        samples: samples[start_trimmed..end_trimmed].to_vec(),
        trimmed_start_ms,
        trimmed_end_ms,
    }
}

fn passthrough(samples: &[i16]) -> TrimResult {
    TrimResult {
        samples: samples.to_vec(),
        trimmed_start_ms: 0,
        trimmed_end_ms: 0,
    }
}

fn samples_to_ms(samples: usize, sample_rate: u32) -> u32 {
    ((samples as u64 * 1000) / sample_rate as u64) as u32
}

fn window_rms(samples: &[i16], window_idx: usize, window_size: usize) -> f32 {
    let start = window_idx * window_size;
    let end = (start + window_size).min(samples.len());
    rms(&samples[start..end])
}

fn rms(samples: &[i16]) -> f32 {
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

/// Return the index of the first speech window, defined as the first
/// window at index `w` such that both window `w` and window `w+1` have
/// an RMS above the threshold. Requiring two consecutive windows filters
/// out isolated clicks / mouse noise.
fn find_first_speech_window(
    samples: &[i16],
    window_size: usize,
    num_windows: usize,
) -> Option<usize> {
    let mut prev_above = false;
    for w in 0..num_windows {
        let above = window_rms(samples, w, window_size) > RMS_THRESHOLD;
        if above && prev_above {
            return Some(w - 1);
        }
        prev_above = above;
    }
    None
}

/// Symmetric to `find_first_speech_window`, scanning backwards. Returns
/// the index of the last window that together with its predecessor is
/// above the threshold.
fn find_last_speech_window(
    samples: &[i16],
    window_size: usize,
    num_windows: usize,
) -> Option<usize> {
    let mut next_above = false;
    for w in (0..num_windows).rev() {
        let above = window_rms(samples, w, window_size) > RMS_THRESHOLD;
        if above && next_above {
            return Some(w + 1);
        }
        next_above = above;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    const SR: u32 = 48_000;

    fn silence(duration_ms: u32, sr: u32) -> Vec<i16> {
        let n = (sr as u64 * duration_ms as u64 / 1000) as usize;
        vec![0i16; n]
    }

    /// Loud sine wave (~0.3 RMS, well above 0.015 threshold).
    fn speech(duration_ms: u32, sr: u32) -> Vec<i16> {
        let n = (sr as u64 * duration_ms as u64 / 1000) as usize;
        let amplitude = (i16::MAX as f32) * 0.4;
        (0..n)
            .map(|i| {
                let t = i as f32 / sr as f32;
                (amplitude * (2.0 * PI * 440.0 * t).sin()) as i16
            })
            .collect()
    }

    /// Very faint signal below threshold (~0.003 RMS).
    fn whisper(duration_ms: u32, sr: u32) -> Vec<i16> {
        let n = (sr as u64 * duration_ms as u64 / 1000) as usize;
        let amplitude = (i16::MAX as f32) * 0.004;
        (0..n)
            .map(|i| {
                let t = i as f32 / sr as f32;
                (amplitude * (2.0 * PI * 440.0 * t).sin()) as i16
            })
            .collect()
    }

    fn concat(parts: &[&[i16]]) -> Vec<i16> {
        parts.iter().flat_map(|p| p.iter().copied()).collect()
    }

    #[test]
    fn trims_leading_and_trailing_silence() {
        let s1 = silence(2000, SR);
        let sp = speech(5000, SR);
        let s2 = silence(1000, SR);
        let input = concat(&[&s1, &sp, &s2]);
        let input_ms = samples_to_ms(input.len(), SR);

        let result = trim_silence(&input, SR);

        // 2s leading silence minus 300ms padding ≈ 1700ms trimmed
        assert!(
            result.trimmed_start_ms >= 1500 && result.trimmed_start_ms <= 1800,
            "expected ~1700ms trimmed from start, got {}",
            result.trimmed_start_ms
        );
        // 1s trailing silence minus 300ms padding ≈ 700ms trimmed
        assert!(
            result.trimmed_end_ms >= 500 && result.trimmed_end_ms <= 800,
            "expected ~700ms trimmed from end, got {}",
            result.trimmed_end_ms
        );
        // Output is shorter than input but keeps all of the speech
        let output_ms = samples_to_ms(result.samples.len(), SR);
        assert!(output_ms < input_ms);
        assert!(output_ms >= 5000, "expected >=5000ms of speech retained");
    }

    #[test]
    fn passthrough_when_no_speech_detected() {
        let input = silence(3000, SR);
        let result = trim_silence(&input, SR);
        assert_eq!(result.samples.len(), input.len());
        assert_eq!(result.trimmed_start_ms, 0);
        assert_eq!(result.trimmed_end_ms, 0);
    }

    #[test]
    fn passthrough_when_speech_too_faint() {
        let input = whisper(3000, SR);
        let result = trim_silence(&input, SR);
        assert_eq!(result.samples.len(), input.len());
        assert_eq!(result.trimmed_start_ms, 0);
    }

    #[test]
    fn passthrough_when_output_would_be_too_short() {
        // 100ms speech sandwiched in 200ms silence → total 500ms, after
        // padding and trim we'd get <500ms, so we return the original.
        let input = concat(&[&silence(200, SR), &speech(100, SR), &silence(200, SR)]);
        let result = trim_silence(&input, SR);
        assert_eq!(result.samples.len(), input.len());
    }

    #[test]
    fn ignores_isolated_click() {
        // Single 20ms loud blip inside silence should NOT be treated as
        // speech (requires 2 consecutive windows above threshold).
        let input = concat(&[&silence(2000, SR), &speech(20, SR), &silence(2000, SR)]);
        let result = trim_silence(&input, SR);
        assert_eq!(result.samples.len(), input.len(), "click must not trigger trim");
    }

    #[test]
    fn keeps_pure_speech_almost_intact() {
        let input = speech(3000, SR);
        let result = trim_silence(&input, SR);
        // Should keep essentially everything (maybe a window or two off the edges,
        // but certainly >90% of the input).
        assert!(result.samples.len() as f32 / input.len() as f32 > 0.9);
    }

    #[test]
    fn handles_empty_input() {
        let result = trim_silence(&[], SR);
        assert!(result.samples.is_empty());
        assert_eq!(result.trimmed_start_ms, 0);
        assert_eq!(result.trimmed_end_ms, 0);
    }

    #[test]
    fn works_at_16khz() {
        let s1 = silence(2000, 16_000);
        let sp = speech(3000, 16_000);
        let s2 = silence(1500, 16_000);
        let input = concat(&[&s1, &sp, &s2]);
        let result = trim_silence(&input, 16_000);
        assert!(result.trimmed_start_ms >= 1500);
        assert!(result.trimmed_end_ms >= 1000);
    }
}
