

import logging
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
from dotenv import load_dotenv
import json
import pyperclip
import time
import tempfile
import platform
import math
import wave
import struct
import setproctitle
import openai
setproctitle.setproctitle("Voice Tool")

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

# Importations spécifiques à Google Cloud
from google.cloud import speech
from google.oauth2 import service_account

# Importations pour l'interface graphique (Tkinter)
from gui_tkinter import VisualizerWindowTkinter # Notre fenêtre de visualiseur Tkinter

# Charger les variables d'environnement depuis le fichier .env
# Utilise le chemin absolu pour être sûr de charger le bon fichier
script_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(script_dir, '.env')
load_dotenv(env_path)

# --- Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
CONFIG_FILE = "config.json"
SAMPLE_RATE = 44100
OUTPUT_FILENAME = "recording.wav"

def get_app_data_dir():
    """Retourne le répertoire AppData pour Voice Tool."""
    if platform.system() == 'Windows':
        appdata = os.getenv('APPDATA', os.path.expanduser('~'))
        app_dir = os.path.join(appdata, 'VoiceTool')
    else:
        # Sur Linux/Mac, utiliser ~/.config/VoiceTool
        app_dir = os.path.join(os.path.expanduser('~'), '.config', 'VoiceTool')
    
    # Créer le répertoire s'il n'existe pas
    os.makedirs(app_dir, exist_ok=True)
    return app_dir

# Chemins vers les fichiers de données
APP_DATA_DIR = get_app_data_dir()
HISTORY_FILE = os.path.join(APP_DATA_DIR, 'transcription_history.json')
SOUNDS_DIR = os.path.join(APP_DATA_DIR, 'sounds')
USER_SETTINGS_FILE = os.path.join(APP_DATA_DIR, 'user_settings.json')

# --- Variables globales ---
config = {} # Contiendra la configuration chargée depuis config.json
user_settings = {} # Contiendra les paramètres utilisateur sauvegardés dans AppData
is_recording = False
hotkey_listener = None
audio_stream = None
audio_frames = []
google_credentials = None
transcription_history = [] # Historique des transcriptions réussies
global_icon_pystray = None # Pour accéder à l'icône depuis d'autres fonctions

# Variables globales pour la GUI Tkinter
visualizer_window = None

# Variables pour la gestion d'instance unique
lock_file = None
LOCK_FILE_PATH = os.path.join(tempfile.gettempdir(), 'voice_tool.lock')
COMMAND_FILE_PATH = os.path.join(tempfile.gettempdir(), 'voice_tool_command.txt')

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

# --- Fonctions de gestion d'instance unique ---

def acquire_lock():
    """Tente d'acquérir le verrou d'instance unique. Retourne True si réussi, False sinon."""
    global lock_file
    try:
        if platform.system() == 'Windows':
            # Sur Windows, on utilise un fichier simple avec gestion d'exception
            if os.path.exists(LOCK_FILE_PATH):
                # Vérifier si le processus est encore actif
                try:
                    with open(LOCK_FILE_PATH, 'r') as f:
                        pid = int(f.read().strip())
                    # Essayer de vérifier si le processus existe encore
                    os.kill(pid, 0)  # Signal 0 ne tue pas mais vérifie l'existence
                    return False  # Le processus existe encore
                except (OSError, ValueError, ProcessLookupError):
                    # Le processus n'existe plus, on peut prendre le verrou
                    os.remove(LOCK_FILE_PATH)
            
            lock_file = open(LOCK_FILE_PATH, 'w')
            lock_file.write(str(os.getpid()))
            lock_file.flush()
            return True
        else:
            # Sur Unix/Linux, on utilise fcntl
            lock_file = open(LOCK_FILE_PATH, 'w')
            fcntl.lockf(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
            lock_file.write(str(os.getpid()))
            lock_file.flush()
            return True
    except (IOError, OSError):
        if lock_file:
            lock_file.close()
            lock_file = None
        return False

def release_lock():
    """Libère le verrou d'instance unique."""
    global lock_file
    if lock_file:
        try:
            if platform.system() == 'Windows':
                lock_file.close()
                os.remove(LOCK_FILE_PATH)
            else:
                fcntl.lockf(lock_file, fcntl.LOCK_UN)
                lock_file.close()
                os.remove(LOCK_FILE_PATH)
        except (IOError, OSError):
            pass
        lock_file = None

def send_command_to_existing_instance(command):
    """Envoie une commande à l'instance existante via un fichier temporaire."""
    try:
        with open(COMMAND_FILE_PATH, 'w') as f:
            f.write(command)
        return True
    except (IOError, OSError):
        return False

def check_for_commands():
    """Vérifie s'il y a des commandes en attente et les exécute."""
    try:
        if os.path.exists(COMMAND_FILE_PATH):
            with open(COMMAND_FILE_PATH, 'r') as f:
                command = f.read().strip()
            os.remove(COMMAND_FILE_PATH)
            
            if command == 'open_window':
                logging.info("Commande reçue: ouverture de la fenêtre principale")
                open_interface()
                return True
    except (IOError, OSError):
        pass
    return False

def start_command_monitor():
    """Démarre le monitoring des commandes dans un thread séparé."""
    def monitor_loop():
        while True:
            try:
                check_for_commands()
                time.sleep(0.5)  # Vérification toutes les 500ms
            except Exception as e:
                logging.error(f"Erreur dans le monitoring des commandes: {e}")
                time.sleep(1)
    
    monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
    monitor_thread.start()
    logging.info("Monitoring des commandes démarré")

# --- Fonctions de gestion de l'historique ---

def load_transcription_history():
    """Charge l'historique des transcriptions depuis le fichier JSON."""
    try:
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Valider la structure du fichier
                if isinstance(data, dict) and 'transcriptions' in data:
                    logging.info(f"Historique chargé: {len(data['transcriptions'])} transcriptions")
                    return data['transcriptions']
                else:
                    logging.warning("Format d'historique invalide, création d'un nouveau fichier")
                    return []
        else:
            logging.info("Aucun fichier d'historique trouvé, création d'un nouveau")
            return []
    except Exception as e:
        logging.error(f"Erreur lors du chargement de l'historique: {e}")
        return []

def save_transcription_history(transcriptions):
    """Sauvegarde l'historique des transcriptions dans le fichier JSON."""
    try:
        history_data = {
            'version': '1.0',
            'created': time.strftime('%Y-%m-%d %H:%M:%S'),
            'transcriptions': transcriptions
        }
        
        # Créer le répertoire si nécessaire
        os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
        
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(history_data, f, ensure_ascii=False, indent=2)
        
        logging.info(f"Historique sauvegardé: {len(transcriptions)} transcriptions")
        return True
    except Exception as e:
        logging.error(f"Erreur lors de la sauvegarde de l'historique: {e}")
        return False

def add_to_transcription_history(text):
    """Ajoute une nouvelle transcription à l'historique et la sauvegarde."""
    global transcription_history
    
    # Créer un nouvel élément d'historique avec métadonnées
    history_item = {
        'text': text,
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
        'date': time.strftime('%Y-%m-%d')
    }
    
    transcription_history.append(history_item)
    
    # Limiter l'historique à 1000 éléments maximum
    if len(transcription_history) > 1000:
        transcription_history = transcription_history[-1000:]
    
    # Sauvegarder immédiatement
    save_transcription_history(transcription_history)
    
    return history_item

def clear_all_transcription_history():
    """Efface tout l'historique des transcriptions."""
    global transcription_history
    # Effacer directement dans le fichier pour être sûr
    empty_list = []
    save_transcription_history(empty_list)
    # Mettre à jour la variable globale
    transcription_history = empty_list
    logging.info("Historique des transcriptions complètement effacé")

# --- Fonctions de gestion des paramètres utilisateur ---

def get_default_user_settings():
    """Retourne les paramètres utilisateur par défaut."""
    return {
        "enable_sounds": True,
        "paste_at_cursor": False,
        "auto_start": False,
        "transcription_provider": "Google",
        "language": "fr-FR"
    }

def load_user_settings():
    """Charge les paramètres utilisateur depuis le fichier JSON dans AppData."""
    try:
        if os.path.exists(USER_SETTINGS_FILE):
            with open(USER_SETTINGS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Valider la structure du fichier
                if isinstance(data, dict) and 'settings' in data:
                    # Fusionner avec les defaults pour garantir toutes les clés
                    defaults = get_default_user_settings()
                    settings = {**defaults, **data['settings']}
                    logging.info("Paramètres utilisateur chargés")
                    return settings
                else:
                    logging.warning("Format de paramètres invalide, utilisation des valeurs par défaut")
                    return get_default_user_settings()
        else:
            logging.info("Aucun fichier de paramètres utilisateur trouvé, initialisation avec valeurs par défaut")
            # Créer le fichier avec les valeurs par défaut
            defaults = get_default_user_settings()
            save_user_settings(defaults)
            return defaults
    except Exception as e:
        logging.error(f"Erreur lors du chargement des paramètres utilisateur: {e}")
        return get_default_user_settings()

def save_user_settings(settings):
    """Sauvegarde les paramètres utilisateur dans le fichier JSON dans AppData."""
    try:
        settings_data = {
            'version': '1.0',
            'created': time.strftime('%Y-%m-%d %H:%M:%S'),
            'settings': settings
        }
        
        # Créer le répertoire si nécessaire
        os.makedirs(os.path.dirname(USER_SETTINGS_FILE), exist_ok=True)
        
        with open(USER_SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(settings_data, f, ensure_ascii=False, indent=2)
        
        logging.info("Paramètres utilisateur sauvegardés")
        return True
    except Exception as e:
        logging.error(f"Erreur lors de la sauvegarde des paramètres utilisateur: {e}")
        return False

def migrate_user_settings(user_params):
    """Migre les anciens paramètres utilisateur depuis config.json vers AppData."""
    try:
        # Charger les paramètres utilisateur existants
        current_user_settings = load_user_settings()
        
        # Fusionner avec les paramètres à migrer (priorité aux existants)
        migrated_settings = {**user_params, **current_user_settings}
        
        # Sauvegarder dans AppData
        save_user_settings(migrated_settings)
        
        logging.info(f"Paramètres utilisateur migrés: {list(user_params.keys())}")
        return True
    except Exception as e:
        logging.error(f"Erreur lors de la migration des paramètres utilisateur: {e}")
        return False

def get_setting(key, default=None):
    """Récupère un paramètre utilisateur depuis AppData ou un paramètre système depuis config."""
    # Pour les paramètres utilisateur, toujours charger depuis AppData
    if key in ['enable_sounds', 'paste_at_cursor', 'auto_start']:
        current_user_settings = load_user_settings()
        return current_user_settings.get(key, default)
    
    # Pour les paramètres système, utiliser config.json
    return config.get(key, default)

# --- Fonctions de génération de sons ---

def generate_sound_wave(frequency, duration, sample_rate=44100, amplitude=0.02):
    """Génère une onde sonore sinusoïdale."""
    frames = int(duration * sample_rate)
    wave_data = []
    for i in range(frames):
        value = amplitude * math.sin(2 * math.pi * frequency * i / sample_rate)
        wave_data.append(int(value * 32767))  # Convertir en 16-bit
    return wave_data

def generate_sweep_sound(start_freq, end_freq, duration, sample_rate=44100, amplitude=0.02):
    """Génère un son avec balayage de fréquence (sweep)."""
    frames = int(duration * sample_rate)
    wave_data = []
    for i in range(frames):
        # Interpolation linéaire de la fréquence
        progress = i / frames
        frequency = start_freq + (end_freq - start_freq) * progress
        value = amplitude * math.sin(2 * math.pi * frequency * i / sample_rate)
        wave_data.append(int(value * 32767))
    return wave_data

def create_sound_files():
    """Crée les fichiers audio pour les différents événements."""
    try:
        os.makedirs(SOUNDS_DIR, exist_ok=True)
        
        # Supprimer les anciens fichiers pour forcer la régénération avec le nouveau volume
        old_files = ['start_recording.wav', 'stop_recording.wav', 'success.wav']
        for old_file in old_files:
            old_path = os.path.join(SOUNDS_DIR, old_file)
            if os.path.exists(old_path):
                os.remove(old_path)
                logging.info(f"Ancien fichier supprimé: {old_file}")
        
        # Son montant (démarrage enregistrement) : 400Hz -> 800Hz
        start_sound = generate_sweep_sound(400, 800, 0.3)
        start_path = os.path.join(SOUNDS_DIR, 'start_recording.wav')
        save_wave_file(start_path, start_sound)
        
        # Son descendant (arrêt enregistrement) : 800Hz -> 400Hz
        stop_sound = generate_sweep_sound(800, 400, 0.3)
        stop_path = os.path.join(SOUNDS_DIR, 'stop_recording.wav')
        save_wave_file(stop_path, stop_sound)
        
        # Son de validation (succès) : deux tons courts
        success_sound = []
        # Premier ton
        success_sound.extend(generate_sound_wave(880, 0.1))  # A5
        # Petit silence
        success_sound.extend([0] * int(0.05 * 44100))
        # Deuxième ton plus aigu
        success_sound.extend(generate_sound_wave(1108, 0.15))  # C#6
        
        success_path = os.path.join(SOUNDS_DIR, 'success.wav')
        save_wave_file(success_path, success_sound)
        
        logging.info("Fichiers audio créés avec succès")
        return {
            'start': start_path,
            'stop': stop_path,
            'success': success_path
        }
        
    except Exception as e:
        logging.error(f"Erreur lors de la création des sons: {e}")
        return None

def save_wave_file(filepath, wave_data, sample_rate=44100):
    """Sauvegarde les données audio en fichier WAV."""
    with wave.open(filepath, 'w') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        
        # Convertir en bytes
        wave_bytes = struct.pack('<' + 'h' * len(wave_data), *wave_data)
        wav_file.writeframes(wave_bytes)

def play_sound_async(sound_path):
    """Joue un son de manière asynchrone selon l'OS."""
    # Vérifier si les sons sont activés
    if not get_setting('enable_sounds', True):
        return
        
    if not sound_path or not os.path.exists(sound_path):
        return
    
    def play():
        try:
            if platform.system() == 'Windows':
                import winsound
                winsound.PlaySound(sound_path, winsound.SND_FILENAME | winsound.SND_ASYNC)
            elif platform.system() == 'Darwin':  # macOS
                os.system(f'afplay "{sound_path}" &')
            else:  # Linux
                os.system(f'aplay "{sound_path}" > /dev/null 2>&1 &')
        except Exception as e:
            logging.error(f"Erreur lors de la lecture du son: {e}")
    
    # Jouer dans un thread séparé pour ne pas bloquer
    threading.Thread(target=play, daemon=True).start()

# --- Fonctions de l'application ---

def load_config():
    """Charge la configuration système depuis config.json (hotkeys seulement)."""
    global config
    # Paramètres SYSTÈME seulement (hotkeys et config technique)
    system_defaults = {
        "record_hotkey": "<ctrl>+<alt>+s",
        "open_window_hotkey": "<ctrl>+<alt>+o"
    }
    
    try:
        if not os.path.exists(CONFIG_FILE):
            logging.info(f"Fichier de configuration système non trouvé, création de {CONFIG_FILE}")
            with open(CONFIG_FILE, 'w') as f:
                json.dump(system_defaults, f, indent=4)
            config = system_defaults
        else:
            with open(CONFIG_FILE, 'r') as f:
                loaded = json.load(f)
                
                # Migration : déplacer les anciens paramètres utilisateur vers AppData
                user_params_to_migrate = {}
                system_params = {}
                
                for key, value in loaded.items():
                    if key in ['enable_sounds', 'paste_at_cursor']:
                        # Paramètre utilisateur à migrer
                        user_params_to_migrate[key] = value
                        logging.info(f"Migration du paramètre utilisateur: {key} = {value}")
                    else:
                        # Paramètre système à conserver
                        system_params[key] = value
                
                # Migrer les paramètres utilisateur vers AppData si nécessaire
                if user_params_to_migrate:
                    migrate_user_settings(user_params_to_migrate)
                    # Nettoyer config.json en gardant seulement les paramètres système
                    clean_config = {**system_defaults, **system_params}
                    with open(CONFIG_FILE, 'w') as f:
                        json.dump(clean_config, f, indent=4)
                    logging.info("config.json nettoyé - paramètres utilisateur migrés vers AppData")
                    config = clean_config
                else:
                    # Fusionner avec les valeurs par défaut
                    config = {**system_defaults, **system_params}
                    
    except Exception as e:
        logging.error(f"Erreur lors du chargement de la configuration : {e}")
        config = system_defaults


def get_google_credentials():
    env_vars = ["PROJECT_ID", "PRIVATE_KEY_ID", "PRIVATE_KEY", "CLIENT_EMAIL", "CLIENT_ID"]
    
    # Debug: vérifier quelles variables sont manquantes
    missing_vars = [var for var in env_vars if not os.getenv(var)]
    if missing_vars:
        logging.error(f"ERREUR: Variables d'environnement manquantes: {missing_vars}")
        logging.error("Vérifiez que le fichier .env existe et contient toutes les variables requises.")
        return None
    credentials_info = {
        "type": "service_account",
        "project_id": os.getenv("PROJECT_ID"),
        "private_key_id": os.getenv("PRIVATE_KEY_ID"),
        "private_key": os.getenv("PRIVATE_KEY", "").replace('\\n', '\n'),
        "client_email": os.getenv("CLIENT_EMAIL"),
        "client_id": os.getenv("CLIENT_ID"),
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{os.getenv('CLIENT_EMAIL', '').replace('@', '%40')}"
    }
    logging.info("Crédentials Google Cloud chargés en mémoire.")
    return service_account.Credentials.from_service_account_info(credentials_info)

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
    icon_path = os.path.join(script_dir, 'voice_tool_icon.ico')
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

def transcribe_with_openai(filename, language=None):
    """Transcrire l'audio avec l'API OpenAI Whisper."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise Exception("La clé API OpenAI n'est pas configurée dans le fichier .env.")

    client = openai.OpenAI(api_key=api_key)

    # Convertir le code langue pour OpenAI (format ISO 639-1)
    language_mapping = {
        "fr-FR": "fr",
        "en-US": "en", 
        "es-ES": "es",
        "de-DE": "de",
        "it-IT": "it",
        "pt-PT": "pt",
        "nl-NL": "nl"
    }
    
    whisper_language = language_mapping.get(language, "fr") if language else "fr"
    
    logging.info(f"OpenAI Whisper - Langue configurée: {whisper_language}")

    with open(filename, "rb") as audio_file:
        response = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language=whisper_language
        )
    return response.text

def transcribe_and_copy(filename):
    global google_credentials, visualizer_window, transcription_history
    try:
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
            # Vérification des credentials
            if google_credentials is None:
                logging.error("Les credentials Google Cloud ne sont pas initialisés.")
                raise Exception("Credentials not initialized")
            
            # Récupérer la langue configurée
            selected_language = current_user_settings.get("language", "fr-FR")
            
            logging.info(f"Utilisation des credentials pour le projet: {google_credentials.project_id}")
            logging.info(f"Langue de transcription: {selected_language}")
            client = speech.SpeechClient(credentials=google_credentials)
            with open(filename, "rb") as audio_file:
                content = audio_file.read()
            audio = speech.RecognitionAudio(content=content)
            recog_config = speech.RecognitionConfig(
                encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
                sample_rate_hertz=SAMPLE_RATE,
                language_code=selected_language,
                enable_automatic_punctuation=True,
                model="latest_long"
            )
            logging.info(f"Envoi de l'audio à Google Cloud Speech (langue: {selected_language})...")
            response = client.recognize(config=recog_config, audio=audio)
            if not response.results:
                logging.warning("Aucun texte n'a pu être transcrit.")
                raise Exception("No text transcribed")
            text = response.results[0].alternatives[0].transcript
        
        elif provider == "OpenAI":
            # Récupérer la langue configurée
            selected_language = current_user_settings.get("language", "fr-FR")
            logging.info(f"Envoi de l'audio à OpenAI Whisper (langue: {selected_language})...")
            text = transcribe_with_openai(filename, selected_language)

        else:
            raise Exception(f"Fournisseur de transcription non valide : {provider}")

        logging.info(f"Texte transcrit: {text}")
        pyperclip.copy(text)
        logging.info("Texte copié dans le presse-papiers !")
        # Coller automatiquement au curseur si l'option est activée
        if get_setting('paste_at_cursor', False):
            # Laisser un court délai pour que l'appli cible reprenne le focus
            time.sleep(0.12)
            paste_to_cursor()
        
        # Jouer le son de succès
        if sound_paths and 'success' in sound_paths:
            play_sound_async(sound_paths['success'])

        # Ajout à l'historique avec sauvegarde automatique
        history_item = add_to_transcription_history(text)
        if visualizer_window and visualizer_window.main_window and visualizer_window.main_window.winfo_exists():
            # Planifie l'ajout dans le thread de la GUI pour éviter les conflits
            visualizer_window.root.after(0, visualizer_window.add_transcription_to_history, history_item)
        
        # Notification visuelle via la fenêtre GUI (désactivée si collage auto pour éviter de voler le focus)
        if visualizer_window and hasattr(visualizer_window, 'show_status') and not get_setting('paste_at_cursor', False):
            visualizer_window.show_status("success")

    except Exception as e:
        logging.error(f"Erreur lors de la transcription/copie : {e}")
        if visualizer_window and hasattr(visualizer_window, 'show_status') and not get_setting('paste_at_cursor', False):
            visualizer_window.show_status("error")

# Plus besoin de la fonction transcription spécialisée - on utilise la standard

def audio_callback(indata, frames, time, status):
    global visualizer_window
    if status:
        logging.warning(status)
    audio_frames.append(indata.copy())
    if indata.size > 0:
        mean_square = np.mean(indata**2)
        if mean_square < 0: mean_square = 0
        rms = np.sqrt(mean_square) / 32768.0
        rms_scaled = rms * 200 
        
        # Mise à jour du visualiseur Tkinter (doit être fait dans le thread Tkinter)
        if visualizer_window and hasattr(visualizer_window, 'window') and visualizer_window.window:
            visualizer_window.window.after(0, visualizer_window.update_visualizer, rms_scaled)

# Plus besoin du callback spécialisé - on utilise le standard

def toggle_recording(icon_pystray):
    global is_recording, audio_stream, audio_frames, visualizer_window

    is_recording = not is_recording

    if is_recording:
        logging.info("Démarrage de l'enregistrement...")
        
        # Jouer le son de démarrage
        if sound_paths and 'start' in sound_paths:
            play_sound_async(sound_paths['start'])
        
        # Note: visualizer_window sera initialisé par le thread principal
        
        # Afficher la fenêtre de visualisation si disponible
        if visualizer_window and hasattr(visualizer_window, 'window') and visualizer_window.window:
            visualizer_window.window.after(0, visualizer_window.show) # Affiche la fenêtre
            visualizer_window.window.after(0, visualizer_window.set_mode, "recording") # Passe en mode enregistrement
        
        audio_frames = []
        audio_stream = sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype='int16', callback=audio_callback)
        audio_stream.start()

    else:
        logging.info("Arrêt de l'enregistrement...")
        
        # Jouer le son d'arrêt
        if sound_paths and 'stop' in sound_paths:
            play_sound_async(sound_paths['stop'])
        
        # Vérification et arrêt sécurisé de l'audio stream
        if not audio_stream:
            logging.warning("Aucun stream audio à arrêter")
            return
            
        try:
            logging.info("Arrêt du stream audio...")
            audio_stream.stop()
            audio_stream.close()
            audio_stream = None  # Réinitialiser la variable
            logging.info("Stream audio fermé avec succès")
        except Exception as e:
            logging.error(f"Erreur lors de la fermeture du stream audio: {e}")
            audio_stream = None  # Réinitialiser même en cas d'erreur
        
        # Vérifier que visualizer_window est bien initialisé
        try:
            if visualizer_window and hasattr(visualizer_window, 'window') and visualizer_window.window:
                visualizer_window.window.after(0, visualizer_window.set_mode, "processing") # Passe en mode traitement
                visualizer_window.window.after(100, visualizer_window.hide) # Cache la fenêtre avec un petit délai
                logging.info("Interface de visualisation mise à jour")
        except Exception as e:
            logging.error(f"Erreur lors de la mise à jour de l'interface: {e}")

        # Sauvegarde sécurisée des données audio
        try:
            if len(audio_frames) == 0:
                logging.warning("Aucune donnée audio à sauvegarder")
                return
                
            logging.info(f"Concaténation de {len(audio_frames)} frames audio...")
            recording_data = np.concatenate(audio_frames, axis=0)
            wav.write(OUTPUT_FILENAME, SAMPLE_RATE, recording_data)
            logging.info(f"Fichier sauvegardé: {OUTPUT_FILENAME}")

            # Lancement de la transcription dans un thread séparé
            logging.info("Lancement de la transcription...")
            threading.Thread(target=transcribe_and_copy, args=(OUTPUT_FILENAME,)).start()
            logging.info("Thread de transcription démarré - Prêt pour un nouvel enregistrement.")
            
        except Exception as e:
            logging.error(f"Erreur lors de la sauvegarde ou de la transcription: {e}")

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
    """Met à jour la configuration système et utilisateur selon le type de paramètre."""
    global config, user_settings, global_icon_pystray
    
    # Séparer les paramètres système des paramètres utilisateur
    system_params = {}
    user_params = {}
    
    for key, value in new_config.items():
        if key in ['record_hotkey', 'open_window_hotkey']:
            system_params[key] = value
        elif key in ['enable_sounds', 'paste_at_cursor', 'auto_start', 'transcription_provider', 'language']:
            user_params[key] = value
        else:
            logging.warning(f"Paramètre inconnu: {key}")
    
    # Sauvegarder les paramètres utilisateur dans AppData
    if user_params:
        user_settings.update(user_params)
        save_user_settings(user_settings)
        logging.info(f"Paramètres utilisateur sauvegardés: {list(user_params.keys())}")
    
    # Sauvegarder les paramètres système dans config.json
    if system_params:
        config.update(system_params)
        try:
            with open(CONFIG_FILE, 'w') as f:
                json.dump(config, f, indent=4)
            logging.info(f"Paramètres système sauvegardés: {list(system_params.keys())}")
        except Exception as e:
            logging.error(f"Erreur lors de la sauvegarde des paramètres système : {e}")
    
    # Redémarrer les hotkeys seulement si les raccourcis ont changé
    if system_params and global_icon_pystray:
        setup_hotkey(global_icon_pystray)
        logging.info("Raccourcis clavier redémarrés")
    
    # Retourner les paramètres effectivement sauvegardés pour mise à jour de l'interface
    return {
        'system_params': system_params,
        'user_params': user_params,
        'current_config': config,
        'current_user_settings': user_settings
    }

def setup_hotkey(icon_pystray):
    global hotkey_listener, config
    if hotkey_listener:
        hotkey_listener.stop()

    hotkey_map = {}
    record_key = config.get('record_hotkey')
    open_key = config.get('open_window_hotkey')

    if record_key: hotkey_map[record_key] = lambda: toggle_recording(icon_pystray)
    if open_key: hotkey_map[open_key] = open_interface

    if not hotkey_map:
        logging.warning("Aucun raccourci clavier n'est configuré.")
        return

    hotkey_listener = keyboard.GlobalHotKeys(hotkey_map)
    hotkey_listener.start()
    logging.info(f"Raccourcis clavier activés : {list(hotkey_map.keys())}")

def quit_from_gui():
    """Ferme l'application depuis l'interface GUI (fermeture synchrone)."""
    global hotkey_listener, visualizer_window, global_icon_pystray, audio_stream
    logging.info("Arrêt de l'application depuis l'interface GUI...")
    
    # Arrêter d'abord les services
    if hotkey_listener:
        hotkey_listener.stop()
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
    global hotkey_listener, visualizer_window
    logging.info("Arrêt de l'application...")
    if hotkey_listener:
        hotkey_listener.stop()
    if audio_stream:
        audio_stream.close()
    if visualizer_window:
        # Planifie la fermeture de la fenêtre Tkinter dans son propre thread
        # pour éviter les problèmes de concurrence qui peuvent bloquer la fermeture.
        visualizer_window.root.after(0, visualizer_window.close)
    
    # Libérer le verrou d'instance unique
    release_lock()
    icon_pystray.stop()

def open_interface():
    """Demande à la boucle Tkinter d'ouvrir l'interface principale."""
    if visualizer_window:
        # On utilise `after` pour s'assurer que la création de la fenêtre
        # se fait dans le thread Tkinter, évitant les problèmes de concurrence.
        # after() ne supporte que les arguments positionnels, donc on utilise lambda
        visualizer_window.root.after(
            0, 
            lambda: visualizer_window.create_main_interface_window(
                history=transcription_history, 
                current_config=config, 
                save_callback=update_and_restart_hotkeys))
    else:
        logging.warning("La fenêtre du visualiseur n'est pas encore initialisée.")

def run_tkinter_app():
    """Fonction pour lancer l'application Tkinter dans un thread séparé."""
    global visualizer_window
    # Créer l'icône avant d'initialiser la GUI
    icon_path = create_window_icon()
    visualizer_window = VisualizerWindowTkinter(icon_path=icon_path)
    visualizer_window.run() # Lance la boucle principale Tkinter

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
    is_console_mode = '--console' in sys.argv
    is_background_child = '--background-child' in sys.argv

    # Si on n'est pas en mode console et qu'on n'est pas déjà le processus enfant,
    # on relance le script en arrière-plan et on quitte.
    if not is_console_mode and not is_background_child:
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

    # --- Configuration du logging ---
    if is_console_mode:
        logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    else:
        # Pour le processus en arrière-plan, on logue dans un fichier
        log_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'voice_tool.log')
        logging.basicConfig(filename=log_file_path, filemode='a', level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

    load_config() # Charge la configuration au démarrage
    
    # Charger les paramètres utilisateur
    global transcription_history, sound_paths, user_settings
    user_settings = load_user_settings()
    
    # Charger l'historique des transcriptions
    transcription_history = load_transcription_history()
    
    # Initialiser les sons
    sound_paths = create_sound_files()

    # Debug: vérifier si le .env est bien chargé
    logging.info(f"Répertoire de travail: {os.getcwd()}")
    logging.info(f"Fichier .env existe: {os.path.exists('.env')}")
    logging.info(f"PROJECT_ID chargé: {'Oui' if os.getenv('PROJECT_ID') else 'Non'}")
    logging.info(f"Répertoire AppData: {APP_DATA_DIR}")
    
    google_credentials = get_google_credentials()
    if not google_credentials:
        return

    logging.info("Démarrage de l'application...")

    # Lancer l'application Tkinter dans un thread séparé
    tkinter_thread = threading.Thread(target=run_tkinter_app)
    tkinter_thread.daemon = True # Permet au thread de se fermer avec l'app principale
    tkinter_thread.start()

    # Attendre que la fenêtre Tkinter soit initialisée avant de continuer
    max_wait = 50  # 5 secondes maximum
    wait_count = 0
    while visualizer_window is None and wait_count < max_wait:
        time.sleep(0.1)
        wait_count += 1
    
    if visualizer_window is None:
        logging.error("Impossible d'initialiser la fenêtre de visualisation dans les temps impartis.")
        return
    else:
        logging.info("Fenêtre de visualisation initialisée avec succès.")

    # --- Rediriger les logs vers la GUI ---
    # Créer le handler personnalisé et l'ajouter au logger racine.
    # Tous les logs seront maintenant aussi envoyés à la GUI si sa fenêtre est ouverte.
    gui_handler = GuiLoggingHandler(visualizer_window)
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s', datefmt='%H:%M:%S')
    gui_handler.setFormatter(formatter)
    logging.getLogger().addHandler(gui_handler)

    # --- Démarrer le monitoring des commandes inter-processus ---
    start_command_monitor()

    # Configuration de l'icône Pystray (reste statique)
    menu = pystray.Menu(
        pystray.MenuItem('Ouvrir', open_interface),
        pystray.MenuItem('Quitter', on_quit)
    )
    icon_path = os.path.join(script_dir, 'voice_tool_icon.ico')
    try:
        icon_image = Image.open(icon_path)
    except Exception as e:
        logging.error(f"Impossible de charger l'icône depuis {icon_path}: {e}")
        # Utiliser une icône de secours
        icon_image = create_icon_pystray('white', 'gray')

    icon_pystray = pystray.Icon(
        'VoiceTool',
        icon=icon_image,
        title='Voice Tool (Ctrl+Alt+S) - Google Cloud',
        menu=menu
    )
    global_icon_pystray = icon_pystray # Rend l'icône accessible globalement
    setup_hotkey(icon_pystray)
    icon_pystray.run()

if __name__ == "__main__":
    main()
