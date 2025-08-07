import logging
import math
import os
import struct
import threading
import wave
from typing import Dict, List

from .paths import SOUNDS_DIR
from .settings import load_user_settings


def generate_sound_wave(frequency: float, duration: float, sample_rate: int = 44100, amplitude: float = 0.02) -> List[int]:
    frames = int(duration * sample_rate)
    wave_data = []
    for i in range(frames):
        value = amplitude * math.sin(2 * math.pi * frequency * i / sample_rate)
        wave_data.append(int(value * 32767))
    return wave_data


def generate_sweep_sound(start_freq: float, end_freq: float, duration: float, sample_rate: int = 44100, amplitude: float = 0.02) -> List[int]:
    frames = int(duration * sample_rate)
    wave_data = []
    for i in range(frames):
        progress = i / frames
        frequency = start_freq + (end_freq - start_freq) * progress
        value = amplitude * math.sin(2 * math.pi * frequency * i / sample_rate)
        wave_data.append(int(value * 32767))
    return wave_data


def save_wave_file(filepath: str, wave_data: List[int], sample_rate: int = 44100) -> None:
    with wave.open(filepath, "w") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wave_bytes = struct.pack("<" + "h" * len(wave_data), *wave_data)
        wav_file.writeframes(wave_bytes)


def create_sound_files() -> Dict[str, str]:
    try:
        os.makedirs(SOUNDS_DIR, exist_ok=True)
        # Always re-generate to ensure consistent volume
        for name in ["start_recording.wav", "stop_recording.wav", "success.wav"]:
            path = os.path.join(SOUNDS_DIR, name)
            if os.path.exists(path):
                os.remove(path)

        start_path = os.path.join(SOUNDS_DIR, "start_recording.wav")
        stop_path = os.path.join(SOUNDS_DIR, "stop_recording.wav")
        success_path = os.path.join(SOUNDS_DIR, "success.wav")

        save_wave_file(start_path, generate_sweep_sound(400, 800, 0.3))
        save_wave_file(stop_path, generate_sweep_sound(800, 400, 0.3))

        success_sound: List[int] = []
        success_sound.extend(generate_sound_wave(880, 0.1))
        success_sound.extend([0] * int(0.05 * 44100))
        success_sound.extend(generate_sound_wave(1108, 0.15))
        save_wave_file(success_path, success_sound)

        logging.info("Fichiers audio créés avec succès")
        return {"start": start_path, "stop": stop_path, "success": success_path}
    except Exception as exc:
        logging.error(f"Erreur lors de la création des sons: {exc}")
        return {}


def play_sound_async(sound_path: str) -> None:
    settings = load_user_settings()
    if not settings.get("enable_sounds", True):
        return
    if not sound_path or not os.path.exists(sound_path):
        return

    def play() -> None:
        try:
            import platform
            system = platform.system()
            if system == "Windows":
                import winsound

                winsound.PlaySound(sound_path, winsound.SND_FILENAME | winsound.SND_ASYNC)
            elif system == "Darwin":
                os.system(f'afplay "{sound_path}" &')
            else:
                os.system(f'aplay "{sound_path}" > /dev/null 2>&1 &')
        except Exception as exc:
            logging.error(f"Erreur lors de la lecture du son: {exc}")

    threading.Thread(target=play, daemon=True).start()


