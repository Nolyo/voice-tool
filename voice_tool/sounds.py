import logging
import math
import os
import struct
import threading
import wave
from typing import Dict, List

from .paths import SOUNDS_DIR
import importlib.resources as resources
import pkgutil
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


def _copy_resource_to_appdata(resource_rel_path: str, dest_name: str) -> str | None:
    """Copie une ressource packagée (si disponible) vers AppData et retourne le chemin."""
    try:
        # Ressource dans voice_tool.assets.sounds
        package = 'voice_tool.assets.sounds'
        dest_path = os.path.join(SOUNDS_DIR, dest_name)
        os.makedirs(SOUNDS_DIR, exist_ok=True)

        # Essai 1: importlib.resources
        try:
            if resources.is_resource(package, resource_rel_path):
                with resources.open_binary(package, resource_rel_path) as src, open(dest_path, 'wb') as dst:
                    dst.write(src.read())
                return dest_path
        except Exception:
            pass

        # Essai 2: pkgutil (meilleur support dans environnements packagés)
        try:
            data = pkgutil.get_data(package, resource_rel_path)
            if data:
                with open(dest_path, 'wb') as dst:
                    dst.write(data)
                return dest_path
        except Exception:
            pass
    except Exception as exc:
        logging.error(f"Copie resource→AppData échouée ({resource_rel_path}): {exc}")
    return None


def create_sound_files() -> Dict[str, str]:
    """Prépare les sons et retourne leurs chemins.

    Priorité:
      1) Ressources packagées copiées vers AppData (si présentes)
      2) Fallback: génération synthétique en AppData
    """
    try:
        os.makedirs(SOUNDS_DIR, exist_ok=True)

        names = {
            "start": "start_recording.wav",
            "stop": "stop_recording.wav",
            "success": "success.wav",
        }

        paths: Dict[str, str] = {}

        # Tenter de copier depuis les ressources packagées
        for key, fname in names.items():
            copied = _copy_resource_to_appdata(fname, fname)
            if copied:
                paths[key] = copied

        # Si une ressource manque, générer en fallback
        to_generate = [k for k in names if k not in paths]
        if to_generate:
            logging.info(f"Ressources son manquantes ({to_generate}), génération fallback…")
            for key in to_generate:
                target = os.path.join(SOUNDS_DIR, names[key])
                if key == 'start':
                    save_wave_file(target, generate_sweep_sound(400, 800, 0.3))
                elif key == 'stop':
                    save_wave_file(target, generate_sweep_sound(800, 400, 0.3))
                elif key == 'success':
                    success_sound: List[int] = []
                    success_sound.extend(generate_sound_wave(880, 0.1))
                    success_sound.extend([0] * int(0.05 * 44100))
                    success_sound.extend(generate_sound_wave(1108, 0.15))
                    save_wave_file(target, success_sound)
                paths[key] = target

        logging.info("Sons prêts")
        return paths
    except Exception as exc:
        logging.error(f"Erreur lors de la préparation des sons: {exc}")
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


