

import logging
import logging.handlers
import sounddevice as sd
import scipy.io.wavfile as wav
from pynput import keyboard
import threading
from PIL import Image, ImageDraw
import pystray
import numpy as np
import os
import sys
import subprocess
import json
import pyperclip
import time
import platform
try:
    import setproctitle  # type: ignore
except Exception:  # noqa: BLE001
    setproctitle = None  # type: ignore
from queue import SimpleQueue, Empty
from threading import Lock, Thread
import faulthandler
import atexit

# Modules refactorisés
from voice_tool import config_manager
from voice_tool import paths as vt_paths
from voice_tool import history as vt_history
from voice_tool import settings as vt_settings
from voice_tool import sounds as vt_sounds
from voice_tool import lock as vt_lock
from voice_tool import transcription as vt_transcription
from voice_tool import formatting as vt_formatting
try:
    if setproctitle:  # type: ignore
        setproctitle.setproctitle("Voice Tool")  # type: ignore
except Exception:
    pass

# Configuration spécifique Windows pour l'identification de l'application dans la Taskbar
if platform.system() == 'Windows':
    try:
        import ctypes
        # Définir l'Application User Model ID pour Windows
        app_id = u'VoiceTool.Application.1.0'
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(app_id)
        
        # Essayer aussi de changer le nom du processus visible dans Task Manager
        try:
            ctypes.windll.kernel32.SetConsoleTitleW("Voice Tool")
        except:
            pass
    except Exception as e:
        logging.warning(f"Impossible de configurer l'App ID Windows: {e}")

# Import conditionnel selon l'OS
if platform.system() != 'Windows':
    import fcntl
else:
    import msvcrt

# Importations pour l'interface graphique (Tkinter)
from gui_tkinter import VisualizerWindowTkinter # Notre fenêtre de visualiseur Tkinter
from voice_tool.splash import SplashWindow

# Charger les variables d'environnement depuis la racine du projet
def _resource_path(relative_path: str) -> str:
    """Compat support: retourne le chemin d'une ressource embarquée (PyInstaller) ou du projet.
    """
    try:
        base_path = sys._MEIPASS  # type: ignore[attr-defined]
    except Exception:
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)

script_dir = os.path.dirname(os.path.abspath(__file__))

# --- Journalisation persistante & diagnostics très précoces ---
try:
    # Déplacer les logs dans AppData/VoiceTool
    LOG_FILE_PATH = os.path.join(vt_paths.APP_DATA_DIR, 'voice_tool.log')
except Exception:
    LOG_FILE_PATH = os.path.join(script_dir, 'voice_tool.log')
try:
    CRASH_LOG_PATH = os.path.join(vt_paths.APP_DATA_DIR, 'voice_tool_crash.log')
except Exception:
    CRASH_LOG_PATH = os.path.join(script_dir, 'voice_tool_crash.log')
_crash_fp = None

def _initialize_persistent_logging() -> None:
    global _crash_fp
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)

    # Éviter les doublons si ré-initialisation
    has_file = any(isinstance(h, logging.handlers.RotatingFileHandler) and getattr(h, 'name', '') == 'voice_tool_file' for h in root_logger.handlers)
    if not has_file:
        try:
            file_handler = logging.handlers.RotatingFileHandler(
                LOG_FILE_PATH, maxBytes=5 * 1024 * 1024, backupCount=2, encoding='utf-8'
            )
            file_handler.name = 'voice_tool_file'
            file_handler.setLevel(logging.DEBUG)
            file_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
            root_logger.addHandler(file_handler)
        except Exception:
            pass

    # Capturer les warnings python
    try:
        logging.captureWarnings(True)
    except Exception:
        pass

    # faulthandler pour dumps de crash
    try:
        if _crash_fp is None:
            _crash_fp = open(CRASH_LOG_PATH, 'a', buffering=1, encoding='utf-8')
        try:
            faulthandler.enable(file=_crash_fp)  # ne couvre pas tous les crashs Windows, mais utile
        except Exception:
            pass
    except Exception:
        pass

    # Hooks d'exception globaux
    try:
        _orig_excepthook = sys.excepthook
        def _log_excepthook(exc_type, exc, tb):
            try:
                logging.error("Exception non interceptée:", exc_info=(exc_type, exc, tb))
            finally:
                try:
                    _orig_excepthook(exc_type, exc, tb)
                except Exception:
                    pass
        sys.excepthook = _log_excepthook
    except Exception:
        pass

    try:
        # Python 3.8+
        def _thread_excepthook(args):
            try:
                logging.error(f"Exception thread {getattr(args, 'thread', None)}:", exc_info=(args.exc_type, args.exc_value, args.exc_traceback))
            except Exception:
                pass
        if hasattr(threading, 'excepthook'):
            threading.excepthook = _thread_excepthook
    except Exception:
        pass

    # Log de sortie de processus
    try:
        @atexit.register
        def _on_exit():
            logging.info("[EXIT] Process Voice Tool terminé")
            try:
                if _crash_fp and not _crash_fp.closed:
                    _crash_fp.flush()
            except Exception:
                pass
    except Exception:
        pass

_initialize_persistent_logging()

# Chargement ENV multi-emplacements (CLI --env, exe dir, AppData, dev root)
try:
    config_manager.load_env_multi(sys.argv)
except Exception:
    # Fallback dev minimal si la nouvelle fonction n'est pas dispo
    config_manager.load_env_from_project_root()

# --- Configuration ---
SAMPLE_RATE = 44100
OUTPUT_FILENAME = "recording.wav"

# Chemins vers les fichiers de données (exposés pour compatibilité)
APP_DATA_DIR = vt_paths.APP_DATA_DIR
HISTORY_FILE = vt_paths.HISTORY_FILE
SOUNDS_DIR = vt_paths.SOUNDS_DIR
RECORDINGS_DIR = vt_paths.RECORDINGS_DIR
USER_SETTINGS_FILE = vt_paths.USER_SETTINGS_FILE

# --- Variables globales ---
config = {}  # Contiendra la configuration système
user_settings = {}  # Contiendra les paramètres utilisateur sauvegardés dans AppData
is_recording = False
hotkey_listener = None
ptt_listener = None
audio_stream = None
audio_stream_device_index = None
audio_frames = []
audio_frames_lock = Lock()
# Verrou pour opérations sur l'historique (évite les courses effacer/ajouter)
history_lock = Lock()
google_credentials = None
transcription_history = [] # Historique des transcriptions réussies
global_icon_pystray = None # Pour accéder à l'icône depuis d'autres fonctions

# Variables globales pour la GUI Tkinter
visualizer_window = None
visualizer_queue: SimpleQueue = SimpleQueue()
processing_queue: SimpleQueue = SimpleQueue()
processing_worker_thread: Thread | None = None
visualizer_poll_started = False
pending_open_settings_tab = False

# Gestion d'instance unique via module vt_lock

# Variables pour les sons
sound_paths = None

# --- Custom Logging Handler ---
class GuiLoggingHandler(logging.Handler):
    """Un handler de log qui envoie les enregistrements à la fenêtre Tkinter."""
    def __init__(self, gui_window_instance):
        super().__init__()
        self.gui_window = gui_window_instance

    def emit(self, record):
        if self.gui_window and self.gui_window.main_window:
            log_entry = self.format(record)
            self.gui_window.add_log_message(log_entry)

# --- Wrappers de gestion d'instance (compatibilité pour gui_tkinter) ---
def acquire_lock():
    return vt_lock.acquire_lock()


def release_lock():
    return vt_lock.release_lock()


def send_command_to_existing_instance(command):
    return vt_lock.send_command_to_existing_instance(command)


def start_command_monitor():
    vt_lock.start_command_monitor(open_interface)

# --- Historique (wrappers) ---
def load_transcription_history():
    return vt_history.load_transcription_history()


def save_transcription_history(transcriptions):
    return vt_history.save_transcription_history(transcriptions)


def add_to_transcription_history(text, audio_path=None):
    global transcription_history
    # Recharger depuis disque + verrou pour éviter toute réapparition de données effacées
    with history_lock:
        try:
            fresh = vt_history.load_transcription_history()
            if isinstance(fresh, list):
                transcription_history = fresh
        except Exception:
            pass
        item = vt_history.add_to_transcription_history(transcription_history, text, audio_path)
    return item


def clear_all_transcription_history():
    global transcription_history
    with history_lock:
        transcription_history = []
        vt_history.save_transcription_history(transcription_history)
    logging.info("Historique des transcriptions complètement effacé")

# --- Fonctions de gestion des paramètres utilisateur ---

# --- Paramètres utilisateur (wrappers) ---
def load_user_settings():
    return vt_settings.load_user_settings()


def save_user_settings(settings):
    return vt_settings.save_user_settings(settings)


def migrate_user_settings(user_params):
    try:
        current_user_settings = vt_settings.load_user_settings()
        migrated = {**user_params, **current_user_settings}
        vt_settings.save_user_settings(migrated)
        logging.info(f"Paramètres utilisateur migrés: {list(user_params.keys())}")
        return True
    except Exception as e:
        logging.error(f"Erreur lors de la migration des paramètres utilisateur: {e}")
        return False


def get_setting(key, default=None):
    if key in [
        "enable_sounds",
        "paste_at_cursor",
        "auto_start",
        "transcription_provider",
        "language",
        "smart_formatting",
        "input_device_index",
    ]:
        return vt_settings.load_user_settings().get(key, default)
    return config.get(key, default)

# --- Sons (wrappers) ---
def create_sound_files():
    return vt_sounds.create_sound_files()


def play_sound_async(sound_path):
    return vt_sounds.play_sound_async(sound_path)

# --- Fonctions de l'application ---


# def get_google_credentials():
#     """Ancienne fonction remplacée par vt_transcription.get_google_credentials_from_env."""
#     return vt_transcription.get_google_credentials_from_env()

def create_icon_pystray(color1, color2):
    width = 64
    height = 64
    image = Image.new('RGB', (width, height), color1)
    dc = ImageDraw.Draw(image)
    dc.rectangle((width // 2, 0, width, height // 2), fill=color2)
    dc.rectangle((0, height // 2, width // 2, height), fill=color2)
    return image

def create_window_icon():
    """Crée une icône plus sophistiquée pour la fenêtre."""
    width = 64
    height = 64
    image = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    dc = ImageDraw.Draw(image)
    
    # Fond circulaire bleu
    dc.ellipse([4, 4, width-4, height-4], fill='#2196F3', outline='#1976D2', width=2)
    
    # Icône microphone stylisé
    mic_color = 'white'
    # Corps du micro
    dc.ellipse([22, 18, 42, 38], fill=mic_color)
    # Tige du micro
    dc.rectangle([30, 38, 34, 50], fill=mic_color)
    # Base du micro
    dc.rectangle([24, 50, 40, 54], fill=mic_color)
    
    # Cercles d'onde sonore
    wave_color = '#FFD700'
    dc.arc([12, 12, 52, 52], 45, 135, fill=wave_color, width=3)
    dc.arc([8, 8, 56, 56], 45, 135, fill=wave_color, width=2)
    
    # Sauvegarder l'icône
    icon_path = _resource_path('voice_tool_icon.ico')
    try:
        image.save(icon_path, format='ICO', sizes=[(16,16), (32,32), (48,48), (64,64)])
        logging.info(f"Icône sauvegardée: {icon_path}")
        return icon_path
    except Exception as e:
        logging.error(f"Erreur lors de la création de l'icône: {e}")
        return None

def paste_to_cursor():
    """Simule un collage (Ctrl/Cmd+V) dans l'application actuellement focalisée.
    Utilise pynput pour envoyer le raccourci 'coller' standard selon l'OS.
    """
    try:
        # Utiliser le contrôleur clavier de pynput
        controller = keyboard.Controller()
        # Petite pause pour laisser le temps au presse-papiers de se mettre à jour
        time.sleep(0.1)
        if platform.system() == 'Darwin':
            # macOS utilise Command ⌘
            with controller.pressed(keyboard.Key.cmd):
                controller.press('v')
                controller.release('v')
        else:
            # Windows/Linux utilisent Ctrl
            with controller.pressed(keyboard.Key.ctrl):
                controller.press('v')
                controller.release('v')
        # Optionnel: légère pause post-collage
        time.sleep(0.03)
        logging.info("Commande de collage envoyée au curseur actif.")
    except Exception as e:
        logging.error(f"Impossible d'envoyer la commande de collage: {e}")

def log_checkpoint(tag: str) -> None:
    try:
        logging.info(f"[CHK] {tag}")
    except Exception:
        pass

def trace_breadcrumb(tag: str) -> None:
    # Alias sémantique
    log_checkpoint(tag)

def transcribe_with_openai(filename, language=None):
    return vt_transcription.transcribe_with_openai(filename, language)

def transcribe_and_copy(filename):
    global google_credentials, visualizer_window, transcription_history
    try:
        logging.info("Début transcribe_and_copy")
        # Recharger les user_settings pour avoir la version la plus récente
        current_user_settings = load_user_settings()
        provider_raw = current_user_settings.get("transcription_provider", "Google")
        
        # Conversion si c'est une valeur d'affichage qui s'est glissée
        provider_mapping = {
            "OpenAI Whisper (recommandé)": "OpenAI",
            "Google": "Google",
            "OpenAI": "OpenAI"
        }
        provider = provider_mapping.get(provider_raw, "Google")
        
        text = ""

        if provider == "Google":
            if google_credentials is None:
                logging.error("Les credentials Google Cloud ne sont pas initialisés.")
                raise Exception("Credentials not initialized")
            selected_language = current_user_settings.get("language", "fr-FR")
            text = vt_transcription.transcribe_with_google(
                filename, SAMPLE_RATE, selected_language, google_credentials
            )
        
        elif provider == "OpenAI":
            # Récupérer la langue configurée
            selected_language = current_user_settings.get("language", "fr-FR")
            logging.info(f"Envoi de l'audio à OpenAI Whisper (langue: {selected_language})...")
            text = transcribe_with_openai(filename, selected_language)

        else:
            raise Exception(f"Fournisseur de transcription non valide : {provider}")

        # Formatage intelligent si activé
        try:
            if get_setting("smart_formatting", True):
                text = vt_formatting.smart_format_text(text)
        except Exception as fmt_e:
            logging.error(f"Erreur formatage intelligent: {fmt_e}")

        logging.info(f"Texte transcrit: {text}")
        pyperclip.copy(text)
        logging.info("Texte copié dans le presse-papiers !")
        # Coller automatiquement au curseur si l'option est activée
        if get_setting('paste_at_cursor', False):
            # Éviter de coller dans l'UI Tk elle-même
            try:
                import tkinter as _tk
                if visualizer_window and visualizer_window.root:
                    focused = visualizer_window.root.focus_get()
                    if focused is not None:
                        logging.info("Focus sur UI Voice Tool détecté: skip auto-paste")
                    else:
                        time.sleep(0.12)
                        paste_to_cursor()
                else:
                    time.sleep(0.12)
                    paste_to_cursor()
            except Exception:
                time.sleep(0.12)
                paste_to_cursor()
        
        # Jouer le son de succès
        if sound_paths and 'success' in sound_paths:
            play_sound_async(sound_paths['success'])

        # Ajout à l'historique avec sauvegarde automatique (associer le fichier audio utilisé)
        history_item = add_to_transcription_history(text, audio_path=filename)
        if visualizer_window and visualizer_window.main_window and visualizer_window.main_window.winfo_exists():
            # Planifie l'ajout dans le thread de la GUI pour éviter les conflits
            visualizer_window.root.after(0, visualizer_window.add_transcription_to_history, history_item)
        
        # Notification visuelle via la fenêtre GUI (planifiée dans le thread Tkinter)
        try:
            if visualizer_window and hasattr(visualizer_window, 'root'):
                visualizer_window.root.after(0, visualizer_window.show_status, "success")
        except Exception as e:
            logging.error(f"Erreur lors de l'affichage du statut success: {e}")

    except Exception as e:
        logging.error(f"Erreur lors de la transcription/copie : {e}")
        try:
            import traceback as _tb
            logging.error("".join(_tb.format_exception(type(e), e, e.__traceback__)))
        except Exception:
            pass
        try:
            if visualizer_window and hasattr(visualizer_window, 'root'):
                visualizer_window.root.after(0, visualizer_window.show_status, "error")
        except Exception as e2:
            logging.error(f"Erreur lors de l'affichage du statut error: {e2}")

# Plus besoin de la fonction transcription spécialisée - on utilise la standard

def audio_callback(indata, frames, time, status):
    global visualizer_window, is_recording
    if status:
        logging.warning(status)
    try:
        if is_recording:
            with audio_frames_lock:
                audio_frames.append(indata.copy())
    except Exception:
        pass
    if is_recording and indata.size > 0:
        mean_square = np.mean(indata**2)
        if mean_square < 0: mean_square = 0
        rms = np.sqrt(mean_square) / 32768.0
        rms_scaled = rms * 200 
        # Pousser le niveau dans une queue thread-safe; le thread Tk lit périodiquement
        try:
            visualizer_queue.put_nowait(rms_scaled)
        except Exception:
            pass

def _poll_visualizer_levels():
    """Lit la queue des niveaux audio et pousse le dernier vers l'UI (thread Tk)."""
    global visualizer_window
    if not visualizer_window:
        return
    last_value = None
    try:
        while True:
            last_value = visualizer_queue.get_nowait()
    except Empty:
        pass
    except Exception:
        last_value = None
    if last_value is not None:
        try:
            visualizer_window.update_visualizer(last_value)
        except Exception:
            pass
    # replanifier à ~30 FPS
    try:
        visualizer_window.root.after(33, _poll_visualizer_levels)
    except Exception:
        pass

def _processing_worker():
    global processing_worker_thread
    logging.info("Worker de traitement audio démarré")
    while True:
        try:
            frames_copy = processing_queue.get()
            if frames_copy is None:
                continue
            try:
                n = len(frames_copy)
            except Exception:
                n = -1
            try:
                if not isinstance(frames_copy, list) or n <= 0:
                    logging.warning("Aucun frame à traiter dans la tâche")
                    # Feedback: son cancel + UI discrète
                    try:
                        if visualizer_window and hasattr(visualizer_window, 'root'):
                            visualizer_window.root.after(0, visualizer_window.set_mode, "idle")
                            visualizer_window.root.after(0, visualizer_window.show_status, "error")
                    except Exception:
                        pass
                    try:
                        if sound_paths and 'cancel' in sound_paths:
                            play_sound_async(sound_paths['cancel'])
                    except Exception:
                        pass
                    continue
                logging.info(f"Concaténation de {n} frames audio (worker)...")
                recording_data = np.concatenate(frames_copy, axis=0)

                # Analyse du signal pour détecter le "vide" (anti-missclick / casque éteint)
                try:
                    duration_sec = float(len(recording_data)) / float(SAMPLE_RATE) if SAMPLE_RATE else 0.0
                except Exception:
                    duration_sec = 0.0
                try:
                    # RMS en int16 (0..32767 approx). La parole normale est largement > 100.
                    rms_val = float(np.sqrt(np.mean((recording_data.astype(np.float32))**2)))
                except Exception:
                    rms_val = 0.0
                min_duration_sec = 0.6  # ignorer < 600ms (anti-missclick)
                min_rms_threshold = 60.0  # seuil de silence effectif

                if duration_sec < min_duration_sec or rms_val < min_rms_threshold:
                    logging.warning(f"Enregistrement ignoré (duration={duration_sec:.3f}s, rms={rms_val:.1f})")
                    # Feedback UI discret
                    try:
                        if visualizer_window and hasattr(visualizer_window, 'root'):
                            visualizer_window.root.after(0, visualizer_window.set_mode, "idle")
                            visualizer_window.root.after(0, visualizer_window.show_status, "error")
                    except Exception:
                        pass
                    try:
                        if sound_paths and 'cancel' in sound_paths:
                            play_sound_async(sound_paths['cancel'])
                    except Exception:
                        pass
                    continue

                # Nom de fichier unique dans AppData/recordings (après validation)
                ts = time.strftime('%Y%m%d_%H%M%S')
                os.makedirs(RECORDINGS_DIR, exist_ok=True)
                out_path = os.path.join(RECORDINGS_DIR, f"recording_{ts}.wav")
                wav.write(out_path, SAMPLE_RATE, recording_data)
                logging.info(f"Fichier sauvegardé: {out_path}")

                # Rétention: conserver N derniers
                try:
                    keep_last = vt_settings.load_user_settings().get("recordings_keep_last", 25)
                    files = []
                    for name in os.listdir(RECORDINGS_DIR):
                        if name.lower().endswith('.wav'):
                            full = os.path.join(RECORDINGS_DIR, name)
                            try:
                                mtime = os.path.getmtime(full)
                            except Exception:
                                mtime = 0
                            files.append((mtime, full))
                    files.sort(reverse=True)
                    for _, path in files[keep_last:]:
                        try:
                            os.remove(path)
                            logging.info(f"Recording supprimé (rétention): {path}")
                        except Exception as de:
                            logging.error(f"Suppression recording échouée: {de}")
                except Exception as re:
                    logging.error(f"Nettoyage rétention recordings: {re}")

                # Lancer la transcription
                logging.info("Lancement de la transcription (worker)...")
                Thread(target=transcribe_and_copy, args=(out_path,), daemon=True).start()
            except Exception as e:
                logging.error(f"Erreur worker traitement: {e}")
                try:
                    import traceback as _tb
                    logging.error("".join(_tb.format_exception(type(e), e, e.__traceback__)))
                except Exception:
                    pass
        except Exception as e:
            logging.error(f"Erreur boucle worker: {e}")
            time.sleep(0.1)

def _ensure_processing_worker_started():
    global processing_worker_thread
    if processing_worker_thread is None or not processing_worker_thread.is_alive():
        processing_worker_thread = Thread(target=_processing_worker, daemon=True)
        processing_worker_thread.start()

def _ensure_audio_stream_started():
    """Démarre et conserve un unique InputStream pour toute la durée de vie de l'app.
    On n'arrête/ferme plus le stream à chaque enregistrement pour éviter les crashs PortAudio sous Windows
    quand la fenêtre principale Tkinter est ouverte.
    """
    global audio_stream, audio_stream_device_index
    if audio_stream is not None:
        return
    try:
        def _sanitize_input_device_index():
            try:
                idx = get_setting("input_device_index", None)
            except Exception:
                idx = None
            try:
                import sounddevice as _sd
                devs = _sd.query_devices()
                if not isinstance(idx, int):
                    return None
                if idx < 0 or idx >= len(devs):
                    return None
                if devs[idx].get('max_input_channels', 0) <= 0:
                    return None
                return idx
            except Exception:
                return None

        input_device_index = _sanitize_input_device_index()
        audio_stream_device_index = input_device_index
        trace_breadcrumb("before_stream_start")
        audio_stream = sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype='int16',
            callback=audio_callback,
            device=input_device_index
        )
        audio_stream.start()
        trace_breadcrumb("after_stream_start")
        logging.info("InputStream démarré (persistant)")
        # Démarrer le poll du visualizer si la fenêtre existe
        try:
            global visualizer_poll_started
            if visualizer_window and hasattr(visualizer_window, 'root') and not visualizer_poll_started:
                visualizer_poll_started = True
                visualizer_window.root.after(0, _poll_visualizer_levels)
        except Exception:
            pass
    except Exception as e:
        logging.error(f"Erreur démarrage InputStream: {e}")
        try:
            import traceback as _tb
            logging.error("".join(_tb.format_exception(type(e), e, e.__traceback__)))
        except Exception:
            pass

# Plus besoin du callback spécialisé - on utilise le standard

def toggle_recording(icon_pystray):
    global is_recording, audio_stream, audio_frames, visualizer_window, last_visualizer_update_ts

    is_recording = not is_recording

    if is_recording:
        logging.info("Démarrage de l'enregistrement...")
        
        # Jouer le son de démarrage
        if sound_paths and 'start' in sound_paths:
            play_sound_async(sound_paths['start'])
        
        # Note: visualizer_window sera initialisé par le thread principal
        
        # Afficher la fenêtre de visualisation si disponible
        if visualizer_window and hasattr(visualizer_window, 'root'):
            visualizer_window.root.after(0, visualizer_window.show)
            visualizer_window.root.after(0, visualizer_window.set_mode, "recording")
        
        # Nettoyer les frames précédentes
        with audio_frames_lock:
            audio_frames.clear()
        # Réinitialiser le throttling du visualiseur au démarrage
        try:
            import time as _t
            last_visualizer_update_ts = _t.monotonic()
        except Exception:
            last_visualizer_update_ts = 0.0
        # S'assurer que le stream audio persistant est démarré
        _ensure_audio_stream_started()

    else:
        logging.info("Arrêt de l'enregistrement...")
        
        # Jouer le son d'arrêt
        if sound_paths and 'stop' in sound_paths:
            play_sound_async(sound_paths['stop'])
        
        # Ne plus arrêter/fermer le stream ici: on le garde persistant pour éviter les crashs
        trace_breadcrumb("skip_stream_close_persistent_mode")
        
        # 1) Snapshot + envoi au worker (avant UI)
        try:
            log_checkpoint("before_frames_snapshot")
            with audio_frames_lock:
                frames_copy2 = list(audio_frames)
                audio_frames.clear()
            log_checkpoint("after_frames_snapshot")
            if len(frames_copy2) == 0:
                logging.warning("Aucune donnée audio à sauvegarder")
                # Feedback: son cancel + UI discrète
                try:
                    if visualizer_window and hasattr(visualizer_window, 'root'):
                        visualizer_window.root.after(0, visualizer_window.set_mode, "idle")
                        visualizer_window.root.after(0, visualizer_window.show_status, "error")
                except Exception:
                    pass
                try:
                    if sound_paths and 'cancel' in sound_paths:
                        play_sound_async(sound_paths['cancel'])
                except Exception:
                    pass
            else:
                # Filtre rapide: ignorer si enregistrement trop court (tap involontaire PTT)
                try:
                    total_samples = 0
                    for _fr in frames_copy2:
                        try:
                            total_samples += len(_fr)
                        except Exception:
                            pass
                    min_duration_sec = 0.6  # ignorer < 600ms (anti-missclick)
                    if total_samples < int(SAMPLE_RATE * min_duration_sec):
                        logging.warning("Enregistrement trop court, annulation de l'envoi au worker")
                        # Retour visuel: repasser en mode idle et montrer une erreur discrète
                        try:
                            if visualizer_window and hasattr(visualizer_window, 'root'):
                                visualizer_window.root.after(0, visualizer_window.set_mode, "idle")
                                visualizer_window.root.after(0, visualizer_window.show_status, "error")
                        except Exception:
                            pass
                        # Son d'erreur léger
                        try:
                            if sound_paths and 'cancel' in sound_paths:
                                play_sound_async(sound_paths['cancel'])
                        except Exception:
                            pass
                    else:
                        _ensure_processing_worker_started()
                        processing_queue.put(frames_copy2)
                        logging.info(f"Tâche de traitement audio envoyée au worker (frames={len(frames_copy2)})")
                        log_checkpoint("after_put_to_worker")
                except Exception as e:
                    logging.error(f"Erreur lors de l'envoi au worker: {e}")
        except Exception as e:
            logging.error(f"Erreur lors de l'envoi au worker: {e}")

        # 2) Mise à jour UI (après une micro-latence)
        try:
            if visualizer_window and hasattr(visualizer_window, 'root'):
                log_checkpoint("before_set_mode_processing")
                # petit délai pour laisser PortAudio/threads se stabiliser
                visualizer_window.root.after(50, visualizer_window.set_mode, "processing")
                logging.info("Interface de visualisation mise à jour - mode traitement activé")
                log_checkpoint("after_set_mode_processing_sched")
        except Exception as e:
            logging.error(f"Erreur lors de la mise à jour de l'interface: {e}")

        log_checkpoint("end_toggle_stop")

def toggle_recording_with_gui(icon_pystray, gui_instance):
    """Version de toggle_recording qui utilise l'instance GUI fournie."""
    global is_recording, audio_stream, audio_frames, visualizer_window
    
    # TRUC SIMPLE : remplacer temporairement visualizer_window par gui_instance
    old_visualizer_window = visualizer_window
    visualizer_window = gui_instance
    
    try:
        # Appeler la fonction normale qui marche
        toggle_recording(icon_pystray)
    finally:
        # Remettre l'ancienne valeur
        visualizer_window = old_visualizer_window

def toggle_recording_from_gui():
    """Version de toggle_recording spécialement pour l'interface GUI."""
    global global_icon_pystray
    toggle_recording(global_icon_pystray)

def update_and_restart_hotkeys(new_config):
    """Met à jour la configuration (hotkeys dans AppData) et redémarre si besoin."""
    global config, user_settings, global_icon_pystray
    
    system_params = {}
    user_params = {}
    hotkey_changed = False
    
    for key, value in new_config.items():
        if key in ['record_hotkey', 'open_window_hotkey']:
            user_params[key] = value
            hotkey_changed = True
        elif key in ['enable_sounds', 'paste_at_cursor', 'auto_start', 'transcription_provider', 'language', 'smart_formatting', 'input_device_index', 'record_mode', 'ptt_hotkey', 'recordings_keep_last']:
            user_params[key] = value
            if key in ['record_mode', 'ptt_hotkey']:
                hotkey_changed = True
        else:
            logging.warning(f"Paramètre inconnu: {key}")
    
    if user_params:
        user_settings.update(user_params)
        save_user_settings(user_settings)
        logging.info(f"Paramètres utilisateur sauvegardés: {list(user_params.keys())}")
    
    if system_params:
        config.update(system_params)
        if not config_manager.save_system_config(config):
            logging.error("Erreur lors de la sauvegarde des paramètres système")
    
    if hotkey_changed and global_icon_pystray:
        setup_hotkey(global_icon_pystray)
        logging.info("Raccourcis clavier redémarrés")
    
    return {
        'system_params': system_params,
        'user_params': user_params,
        'current_config': config,
        'current_user_settings': user_settings
    }

def setup_hotkey(icon_pystray):
    global hotkey_listener, ptt_listener, config
    # Stopper d'anciens écouteurs si présents
    try:
        if hotkey_listener:
            hotkey_listener.stop()
    except Exception:
        pass
    try:
        if ptt_listener:
            ptt_listener.stop()
    except Exception:
        pass

    hotkey_listener = None
    ptt_listener = None

    hotkey_map = {}
    # Lire depuis AppData désormais
    current_user_settings = vt_settings.load_user_settings()
    record_mode = current_user_settings.get('record_mode', 'toggle')
    record_key = current_user_settings.get('record_hotkey')
    ptt_key = current_user_settings.get('ptt_hotkey')
    open_key = current_user_settings.get('open_window_hotkey')

    active_keys = []

    if record_mode == 'toggle' and record_key:
        hotkey_map[record_key] = lambda: toggle_recording(icon_pystray)
    elif record_mode == 'ptt' and ptt_key:
        # Listener PTT custom: démarrer à l'appui de toute la combo, couper dès qu'un des éléments est relâché
        combo_keys = set(keyboard.HotKey.parse(ptt_key))
        pressed_keys = set()

        listener_ref = {'l': None}

        def on_press(key):
            try:
                k = listener_ref['l'].canonical(key)
                pressed_keys.add(k)
                if combo_keys.issubset(pressed_keys) and not is_recording:
                    toggle_recording(icon_pystray)
            except Exception:
                pass

        def on_release(key):
            try:
                k = listener_ref['l'].canonical(key)
                if k in pressed_keys:
                    pressed_keys.remove(k)
                if is_recording and not combo_keys.issubset(pressed_keys):
                    toggle_recording(icon_pystray)
            except Exception:
                pass

        listener_ref['l'] = keyboard.Listener(on_press=on_press, on_release=on_release)
        ptt_listener = listener_ref['l']
        ptt_listener.start()
        active_keys.append(ptt_key)

    # Toujours gérer le raccourci d'ouverture de fenêtre via GlobalHotKeys s'il existe
    if open_key:
        hotkey_map[open_key] = open_interface

    if hotkey_map:
        hotkey_listener = keyboard.GlobalHotKeys(hotkey_map)
        hotkey_listener.start()
        active_keys.extend(list(hotkey_map.keys()))

    if not active_keys:
        logging.warning("Aucun raccourci clavier n'est configuré.")
    else:
        logging.info(f"Raccourcis clavier activés : {active_keys}")

def quit_from_gui():
    """Ferme l'application depuis l'interface GUI (fermeture synchrone)."""
    global hotkey_listener, ptt_listener, visualizer_window, global_icon_pystray, audio_stream
    logging.info("Arrêt de l'application depuis l'interface GUI...")
    
    # Arrêter d'abord les services
    if hotkey_listener:
        hotkey_listener.stop()
    if ptt_listener:
        ptt_listener.stop()
    if audio_stream:
        audio_stream.close()
    
    # Fermer Tkinter de façon synchrone (on est déjà dans le thread Tkinter)
    if visualizer_window:
        try:
            visualizer_window.close()
        except:
            pass
    
    # Libérer le verrou d'instance unique
    release_lock()
    
    # Arrêter l'icône pystray en dernier avec un délai pour éviter le zombie
    if global_icon_pystray:
        # Utiliser un thread séparé pour arrêter l'icône avec un petit délai
        import threading
        def stop_icon():
            import time
            time.sleep(0.1)  # Petit délai pour que Tkinter se ferme complètement
            try:
                global_icon_pystray.stop()
            except:
                pass
        
        threading.Thread(target=stop_icon, daemon=True).start()
    
    # Forcer la sortie du processus
    import sys
    import os
    os._exit(0)

def on_quit(icon_pystray, item):
    global hotkey_listener, ptt_listener, visualizer_window
    logging.info("Arrêt de l'application...")
    if hotkey_listener:
        hotkey_listener.stop()
    if ptt_listener:
        ptt_listener.stop()
    if audio_stream:
        audio_stream.close()
    if visualizer_window:
        # Planifie la fermeture de la fenêtre Tkinter dans son propre thread
        # pour éviter les problèmes de concurrence qui peuvent bloquer la fermeture.
        visualizer_window.root.after(0, visualizer_window.close)
    
    # Libérer le verrou d'instance unique
    release_lock()
    icon_pystray.stop()

def _ui_thread_entry(icon_path):
    """Point d'entrée du thread UI: crée la fenêtre et lance la boucle Tk."""
    global visualizer_window
    try:
        logging.info("[UI] Démarrage du thread UI…")
        # Toutes les opérations Tk doivent rester dans ce thread
        visualizer_window = VisualizerWindowTkinter(icon_path=icon_path)
        # Créer immédiatement l'interface principale dans ce même thread
        visualizer_window.create_main_interface_window(
            history=transcription_history,
            current_config=config,
            save_callback=update_and_restart_hotkeys
        )
        # Si une demande d'ouverture directe de l'onglet Paramètres est en attente, l'appliquer maintenant
        try:
            global pending_open_settings_tab
            if pending_open_settings_tab:
                pending_open_settings_tab = False
                try:
                    visualizer_window.open_settings_tab()
                except Exception:
                    pass
        except Exception:
            pass
        # Lancer la boucle
        visualizer_window.run()
    except Exception as e:
        logging.error(f"Thread UI: échec d'initialisation de la fenêtre: {e}")


def open_interface():
    """Ouvre l'interface principale (démarre un thread UI si nécessaire)."""
    global visualizer_window
    logging.info("[UI] open_interface() appelé")
    if visualizer_window is None:
        try:
            icon_path = create_window_icon()
        except Exception:
            icon_path = None
        # Démarrer la fenêtre et sa boucle Tk dans un thread dédié
        t = threading.Thread(target=_ui_thread_entry, args=(icon_path,), daemon=True)
        t.start()
    else:
        # Planifier la création/affichage de l'UI dans le thread Tk existant
        try:
            logging.info("[UI] Planification de create_main_interface_window via after()")
            visualizer_window.root.after(
                0,
                lambda: visualizer_window.create_main_interface_window(
                    history=transcription_history,
                    current_config=config,
                    save_callback=update_and_restart_hotkeys))
        except Exception:
            pass

def run_pystray_icon():
    """Démarre l'icône système pystray (à appeler dans un thread)."""
    global global_icon_pystray
    def _open_logs_folder(_icon=None, _item=None):
        try:
            from voice_tool.paths import APP_DATA_DIR as _APP
            log_dir = _APP
            if platform.system() == 'Windows':
                os.startfile(log_dir)  # type: ignore
            elif platform.system() == 'Darwin':
                os.system(f"open '{log_dir}'")
            else:
                os.system(f"xdg-open '{log_dir}'")
        except Exception as e:
            logging.error(f"Impossible d'ouvrir le dossier des logs: {e}")

    # Menu contextuel: Ouvrir (défaut = double‑clic), Ouvrir paramètres, Ouvrir le dossier des logs, Quitter
    def _open_settings(_icon=None, _item=None):
        try:
            # Marquer l'intention d'ouvrir l'onglet Paramètres et ouvrir l'interface
            global pending_open_settings_tab
            pending_open_settings_tab = True
            open_interface()
            # Basculer sur l'onglet Paramètres dans le thread UI
            if visualizer_window and hasattr(visualizer_window, 'root'):
                visualizer_window.root.after(0, getattr(visualizer_window, 'open_settings_tab', lambda: None))
        except Exception as e:
            logging.error(f"Impossible d'ouvrir les paramètres: {e}")

    menu = pystray.Menu(
        pystray.MenuItem('Ouvrir', open_interface, default=True),
        pystray.MenuItem('Ouvrir paramètres', _open_settings),
        pystray.MenuItem('Ouvrir le dossier des logs', _open_logs_folder),
        pystray.MenuItem('Quitter', on_quit)
    )
    icon_path = _resource_path('voice_tool_icon.ico')
    try:
        icon_image = Image.open(icon_path)
    except Exception as e:
        logging.error(f"Impossible de charger l'icône depuis {icon_path}: {e}")
        # Utiliser une icône de secours
        icon_image = create_icon_pystray('white', 'gray')

    icon_pystray = pystray.Icon(
        'VoiceTool',
        icon=icon_image,
        title='Voice Tool',
        menu=menu
    )
    global_icon_pystray = icon_pystray
    icon_pystray.run()

def main():
    global google_credentials, visualizer_window, global_icon_pystray

    # --- Vérification d'instance unique ---
    # Tenter d'acquérir le verrou avant toute autre opération
    if not acquire_lock():
        # Une autre instance est déjà en cours d'exécution
        print("Une instance de Voice Tool est déjà en cours d'exécution.")
        print("Ouverture de la fenêtre principale de l'instance existante...")
        
        # Envoyer la commande d'ouverture de fenêtre à l'instance existante
        if send_command_to_existing_instance('open_window'):
            print("Commande envoyée avec succès.")
        else:
            print("Impossible d'envoyer la commande à l'instance existante.")
        
        sys.exit(0)

    # --- Gestion du mode de lancement (console ou arrière-plan) ---
    # Si '--console' est passé en argument, on est en mode de développement/debug.
    # Sinon, on lance en arrière-plan.
    # Modes
    is_console_mode = '--console' in sys.argv or '--debug' in sys.argv
    is_background_child = '--background-child' in sys.argv

    # Si on n'est pas en mode console et qu'on n'est pas déjà le processus enfant,
    # on relance le script en arrière-plan et on quitte.
    # En version packagée, ne pas relancer un process enfant
    is_frozen = getattr(sys, 'frozen', False)
    if not is_console_mode and not is_background_child and not is_frozen:
        # Libérer le verrou avant de relancer, car le processus enfant devra l'acquérir
        release_lock()
        
        try:
            # Construit le chemin vers pythonw.exe pour un lancement sans console sur Windows
            python_executable = sys.executable.replace('python.exe', 'pythonw.exe')
            script_path = os.path.abspath(__file__)
            args = [python_executable, script_path, '--background-child']

            # Lance le processus enfant de manière détachée
            subprocess.Popen(args, creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NO_WINDOW)
            print("Application lancée en arrière-plan. Les logs sont dans 'voice_tool.log'.")
            sys.exit(0)
        except Exception as e:
            print(f"Erreur lors du lancement en arrière-plan : {e}")
            sys.exit(1)

    # --- Configuration du logging complémentaire ---
    # Ajouter un handler console si en mode console (sans modifier le file handler déjà actif)
    if is_console_mode:
        root_logger = logging.getLogger()
        has_console = any(isinstance(h, logging.StreamHandler) and not isinstance(h, logging.FileHandler) for h in root_logger.handlers)
        if not has_console:
            sh = logging.StreamHandler()
            sh.setLevel(logging.DEBUG)
            sh.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
            root_logger.addHandler(sh)
        # Niveau de logs plus verbeux en debug
        try:
            logging.getLogger().setLevel(logging.DEBUG)
        except Exception:
            pass

    # Splash screen (hors debug)
    splash = None
    splash_start_ts = None
    if not is_console_mode:
        try:
            splash = SplashWindow()
            splash.show("Initialisation…")
            try:
                splash_start_ts = time.monotonic()
            except Exception:
                splash_start_ts = None
        except Exception:
            splash = None

    # Charger la configuration système (peut être vide, non bloquant)
    global config
    config = config_manager.load_system_config()
    
    # Charger les paramètres utilisateur
    global transcription_history, sound_paths, user_settings
    if splash:
        splash.set_message("Chargement des paramètres…")
        splash.pump()
    user_settings = load_user_settings()
    
    # Charger l'historique des transcriptions
    if splash:
        splash.set_message("Chargement de l'historique…")
        splash.pump()
    transcription_history = load_transcription_history()
    
    # Initialiser les sons
    if splash:
        splash.set_message("Préparation des sons…")
        splash.pump()
    sound_paths = create_sound_files()

    # Debug: vérifier si le .env est bien chargé
    logging.info(f"Répertoire de travail: {os.getcwd()}")
    logging.info(f"Fichier .env existe: {os.path.exists('.env')}")
    logging.info(f"PROJECT_ID chargé: {'Oui' if os.getenv('PROJECT_ID') else 'Non'}")
    logging.info(f"Répertoire AppData: {APP_DATA_DIR}")
    
    # Crédentials Google depuis l'environnement
    if splash:
        splash.set_message("Initialisation des accès API…")
        splash.pump()
    google_credentials = vt_transcription.get_google_credentials_from_env()
    if not google_credentials:
        logging.warning("Clés API manquantes: l'application démarre quand même (fonctionnalités limitées).")
        if splash:
            try:
                splash.set_message("Clés API manquantes (non bloquant)…")
                splash.pump()
            except Exception:
                pass

    logging.info("Démarrage de l'application...")

    # Initialiser la fenêtre principale uniquement en mode console.
    if is_console_mode:
        icon_path = create_window_icon()
        visualizer_window = VisualizerWindowTkinter(icon_path=icon_path)
        # S'assurer que la racine Tk est initialisée avant tout usage différé
        try:
            visualizer_window.root.update_idletasks()
        except Exception:
            pass

    # Rediriger les logs vers la GUI uniquement si la fenêtre existe (mode console)
    if visualizer_window is not None:
        gui_handler = GuiLoggingHandler(visualizer_window)
        formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s', datefmt='%H:%M:%S')
        gui_handler.setFormatter(formatter)
        logging.getLogger().addHandler(gui_handler)

    # Démarrer le monitoring des commandes inter-processus
    start_command_monitor()

    # Démarrer l'icône pystray dans un thread séparé
    if splash:
        splash.set_message("Icône système…")
        splash.pump()
    tray_thread = threading.Thread(target=run_pystray_icon, daemon=False)
    tray_thread.start()

    # Configurer les hotkeys (utilise global_icon_pystray qui sera défini par run_pystray_icon)
    # Attendre un court instant que l'icône soit prête
    for _ in range(20):
        if global_icon_pystray:
            break
        time.sleep(0.05)
    if global_icon_pystray:
        setup_hotkey(global_icon_pystray)
    else:
        logging.warning("Icône pystray non initialisée à temps; les hotkeys seront configurés plus tard.")

    # Démarrer le stream audio persistant tôt dans la vie du processus (thread principal)
    if splash:
        splash.set_message("Initialisation audio…")
        splash.pump()
    try:
        _ensure_audio_stream_started()
    except Exception as e:
        logging.error(f"Échec du démarrage initial de l'InputStream: {e}")

    # Fermer le splash (respecter une durée minimale d'affichage de 3s)
    if splash:
        try:
            try:
                if splash_start_ts is not None:
                    elapsed = time.monotonic() - splash_start_ts
                    if elapsed < 3.0:
                        time.sleep(max(0.0, 3.0 - elapsed))
            except Exception:
                pass
            splash.close()
            # Assainir tout root Tk implicite qui pourrait persister
            try:
                import tkinter as tk  # type: ignore
                if getattr(tk, "_default_root", None) is not None:
                    try:
                        tk._default_root.withdraw()
                    except Exception:
                        pass
                    try:
                        tk._default_root.destroy()
                    except Exception:
                        pass
                    try:
                        tk._default_root = None
                    except Exception:
                        pass
            except Exception:
                pass
        except Exception:
            pass

    # En console: ouvrir la fenêtre principale directement sur les logs
    if is_console_mode:
        try:
            open_interface()
        except Exception:
            pass

    # Lancer la boucle principale Tkinter (thread principal) uniquement en console
    if is_console_mode and visualizer_window is not None:
        visualizer_window.run()
    else:
        # En arrière-plan, empêcher la fin du processus tant que le tray est actif
        try:
            tray_thread.join()
        except Exception:
            pass

if __name__ == "__main__":
    main()
