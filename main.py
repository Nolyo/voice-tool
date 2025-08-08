

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
import json
import pyperclip
import time
import platform
import setproctitle

# Modules refactorisés
from voice_tool import config_manager
from voice_tool import paths as vt_paths
from voice_tool import history as vt_history
from voice_tool import settings as vt_settings
from voice_tool import sounds as vt_sounds
from voice_tool import lock as vt_lock
from voice_tool import transcription as vt_transcription
from voice_tool import formatting as vt_formatting
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

# Importations pour l'interface graphique (Tkinter)
from gui_tkinter import VisualizerWindowTkinter # Notre fenêtre de visualiseur Tkinter

# Charger les variables d'environnement depuis la racine du projet
script_dir = os.path.dirname(os.path.abspath(__file__))
config_manager.load_env_from_project_root()

# --- Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
SAMPLE_RATE = 44100
OUTPUT_FILENAME = "recording.wav"

# Chemins vers les fichiers de données (exposés pour compatibilité)
APP_DATA_DIR = vt_paths.APP_DATA_DIR
HISTORY_FILE = vt_paths.HISTORY_FILE
SOUNDS_DIR = vt_paths.SOUNDS_DIR
USER_SETTINGS_FILE = vt_paths.USER_SETTINGS_FILE

# --- Variables globales ---
config = {}  # Contiendra la configuration système
user_settings = {}  # Contiendra les paramètres utilisateur sauvegardés dans AppData
is_recording = False
hotkey_listener = None
audio_stream = None
audio_frames = []
google_credentials = None
transcription_history = [] # Historique des transcriptions réussies
global_icon_pystray = None # Pour accéder à l'icône depuis d'autres fonctions

# Variables globales pour la GUI Tkinter
visualizer_window = None

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


def add_to_transcription_history(text):
    global transcription_history
    item = vt_history.add_to_transcription_history(transcription_history, text)
    return item


def clear_all_transcription_history():
    global transcription_history
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
    return vt_transcription.transcribe_with_openai(filename, language)

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
        
        # Notification visuelle via la fenêtre GUI (planifiée dans le thread Tkinter)
        try:
            if visualizer_window and hasattr(visualizer_window, 'root'):
                visualizer_window.root.after(0, visualizer_window.show_status, "success")
        except Exception as e:
            logging.error(f"Erreur lors de l'affichage du statut success: {e}")

    except Exception as e:
        logging.error(f"Erreur lors de la transcription/copie : {e}")
        try:
            if visualizer_window and hasattr(visualizer_window, 'root'):
                visualizer_window.root.after(0, visualizer_window.show_status, "error")
        except Exception as e2:
            logging.error(f"Erreur lors de l'affichage du statut error: {e2}")

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
        if visualizer_window and hasattr(visualizer_window, 'root'):
            visualizer_window.root.after(0, visualizer_window.update_visualizer, rms_scaled)

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
        if visualizer_window and hasattr(visualizer_window, 'root'):
            visualizer_window.root.after(0, visualizer_window.show)
            visualizer_window.root.after(0, visualizer_window.set_mode, "recording")
        
        audio_frames = []
        # Utiliser le périphérique d'entrée choisi si disponible
        try:
            input_device_index = get_setting("input_device_index", None)
        except Exception:
            input_device_index = None
        audio_stream = sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype='int16', callback=audio_callback, device=input_device_index)
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
            if visualizer_window and hasattr(visualizer_window, 'root'):
                visualizer_window.root.after(0, visualizer_window.set_mode, "processing")
                logging.info("Interface de visualisation mise à jour - mode traitement activé")
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
    """Met à jour la configuration (hotkeys dans AppData) et redémarre si besoin."""
    global config, user_settings, global_icon_pystray
    
    system_params = {}
    user_params = {}
    hotkey_changed = False
    
    for key, value in new_config.items():
        if key in ['record_hotkey', 'open_window_hotkey']:
            user_params[key] = value
            hotkey_changed = True
        elif key in ['enable_sounds', 'paste_at_cursor', 'auto_start', 'transcription_provider', 'language', 'smart_formatting', 'input_device_index']:
            user_params[key] = value
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
    global hotkey_listener, config
    if hotkey_listener:
        hotkey_listener.stop()

    hotkey_map = {}
    # Lire depuis AppData désormais
    current_user_settings = vt_settings.load_user_settings()
    record_mode = current_user_settings.get('record_mode', 'toggle')
    record_key = current_user_settings.get('record_hotkey')
    ptt_key = current_user_settings.get('ptt_hotkey')
    open_key = current_user_settings.get('open_window_hotkey')

    if record_mode == 'toggle' and record_key:
        hotkey_map[record_key] = lambda: toggle_recording(icon_pystray)
    elif record_mode == 'ptt' and ptt_key:
        # En PTT: start on press, stop on release
        # pynput GlobalHotKeys ne gère pas directement press/release séparés.
        # On utilise deux entrées : une pour press (démarrer), une pour release (arrêter) via Key combination tricks.
        # Simplification: assigner la même combo pour start/stop avec wrapper press/release séparés via keyboard.Listener.
        pass
    if open_key: hotkey_map[open_key] = open_interface

    if not hotkey_map:
        logging.warning("Aucun raccourci clavier n'est configuré.")
        return

    if record_mode == 'ptt' and ptt_key:
        # Écouteur spécifique pour PTT
        def on_press(key):
            try:
                # Démarrer si combo correspond et si pas déjà en cours
                combo = ptt_key
                # Utiliser la même logique que GlobalHotKeys: comparer via ._repr? Simplifié: utiliser keyboard.HotKey
            except Exception:
                pass

        # Utiliser l'utilitaire HotKey de pynput
        def parse_combo(c):
            # Convertit "<ctrl>+a" en une séquence pour HotKey
            parts = [p.strip() for p in c.split('+') if p.strip()]
            seq = []
            for p in parts:
                if p.startswith('<') and p.endswith('>'):
                    name = p[1:-1]
                    seq.append(getattr(keyboard.Key, name, None) or p)
                else:
                    seq.append(p)
            return seq

        start_hotkey = keyboard.HotKey(keyboard.HotKey.parse(ptt_key), lambda: (not is_recording) and toggle_recording(icon_pystray))
        stop_hotkey = keyboard.HotKey(keyboard.HotKey.parse(ptt_key), lambda: is_recording and toggle_recording(icon_pystray))

        def for_canonical(f):
            return lambda k: f(hotkey_listener.canonical(k))

        hotkey_listener = keyboard.Listener(
            on_press=for_canonical(start_hotkey.press),
            on_release=for_canonical(stop_hotkey.release)
        )
        hotkey_listener.start()
        active_keys = [ptt_key]
    else:
        hotkey_listener = keyboard.GlobalHotKeys(hotkey_map)
        hotkey_listener.start()
        active_keys = list(hotkey_map.keys())

    logging.info(f"Raccourcis clavier activés : {active_keys}")

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

    # Charger la configuration système (peut être vide, non bloquant)
    global config
    config = config_manager.load_system_config()
    
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
    
    # Crédentials Google depuis l'environnement
    google_credentials = vt_transcription.get_google_credentials_from_env()
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
