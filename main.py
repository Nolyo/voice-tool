import logging
import sounddevice as sd
import scipy.io.wavfile as wav
from pynput import keyboard
import threading
from PIL import Image, ImageDraw
import pystray
import numpy as np
import os
from dotenv import load_dotenv
import json
import pyperclip
import time

# Importations spécifiques à Google Cloud
from google.cloud import speech
from google.oauth2 import service_account

# Charger les variables d'environnement depuis le fichier .env
load_dotenv()

# --- Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
HOTKEY_STRING = '<ctrl>+<alt>+s'
SAMPLE_RATE = 44100
OUTPUT_FILENAME = "recording.wav"

# --- Variables globales ---
is_recording = False
hotkey_listener = None
audio_stream = None
audio_frames = []
google_credentials = None # Pour stocker les crédentials en mémoire

# --- Fonctions de l'application ---

def get_google_credentials():
    """Crée un objet credentials en mémoire à partir des variables d'environnement."""
    env_vars = ["PROJECT_ID", "PRIVATE_KEY_ID", "PRIVATE_KEY", "CLIENT_EMAIL", "CLIENT_ID"]
    if not all(os.getenv(var) for var in env_vars):
        logging.error("ERREUR: Toutes les variables d'environnement Google Cloud ne sont pas définies dans le .env")
        return None

    credentials_info = {
        "type": "service_account",
        "project_id": os.getenv("PROJECT_ID"),
        "private_key_id": os.getenv("PRIVATE_KEY_ID"),
        "private_key": os.getenv("PRIVATE_KEY").replace('\n', '\n'),
        "client_email": os.getenv("CLIENT_EMAIL"),
        "client_id": os.getenv("CLIENT_ID"),
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{os.getenv('CLIENT_EMAIL').replace('@', '%40')}"
    }
    
    logging.info("Crédentials Google Cloud chargés en mémoire.")
    return service_account.Credentials.from_service_account_info(credentials_info)

def create_icon(color1, color2):
    width = 64
    height = 64
    image = Image.new('RGB', (width, height), color1)
    dc = ImageDraw.Draw(image)
    dc.rectangle((width // 2, 0, width, height // 2), fill=color2)
    dc.rectangle((0, height // 2, width // 2, height), fill=color2)
    return image

def transcribe_and_copy(filename, icon):
    """Transcription directe avec l'API Google Cloud pour une qualité optimale."""
    global google_credentials
    try:
        client = speech.SpeechClient(credentials=google_credentials)

        with open(filename, "rb") as audio_file:
            content = audio_file.read()

        audio = speech.RecognitionAudio(content=content)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=SAMPLE_RATE,
            language_code="fr-FR",
            # --- Options avancées pour la qualité de dictée ---
            enable_automatic_punctuation=True,
            model="latest_long" # Modèle optimisé pour les formats longs
        )

        logging.info("Envoi de l'audio à Google Cloud Speech (mode dictée)...")
        response = client.recognize(config=config, audio=audio)
        
        if not response.results:
            logging.warning("Aucun texte n'a pu être transcrit.")
            raise sr.UnknownValueError()

        text = response.results[0].alternatives[0].transcript
        logging.info(f"Texte transcrit: {text}")
        
        pyperclip.copy(text)
        logging.info("Texte copié dans le presse-papiers !")
        
        icon.icon = create_icon('green', 'darkgreen')
        time.sleep(2)

    except Exception as e:
        logging.error(f"Erreur lors de la transcription/copie : {e}")
        icon.icon = create_icon('orange', 'darkorange')
        time.sleep(2)
    finally:
        if not is_recording:
            icon.icon = create_icon('white', 'gray')

def toggle_recording(icon):
    global is_recording, audio_stream, audio_frames
    is_recording = not is_recording
    if is_recording:
        logging.info("Démarrage de l'enregistrement...")
        icon.icon = create_icon('blue', 'darkblue')
        audio_frames = []
        def audio_callback(indata, frames, time, status):
            if status: logging.warning(status)
            audio_frames.append(indata.copy())
        audio_stream = sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype='int16', callback=audio_callback)
        audio_stream.start()
    else:
        if not audio_stream: return
        logging.info("Arrêt de l'enregistrement...")
        audio_stream.stop()
        audio_stream.close()
        icon.icon = create_icon('white', 'gray')
        recording_data = np.concatenate(audio_frames, axis=0)
        wav.write(OUTPUT_FILENAME, SAMPLE_RATE, recording_data)
        logging.info(f"Fichier sauvegardé: {OUTPUT_FILENAME}")
        threading.Thread(target=transcribe_and_copy, args=(OUTPUT_FILENAME, icon)).start()
        logging.info("Prêt pour un nouvel enregistrement.")

def setup_hotkey(icon):
    global hotkey_listener
    if hotkey_listener: hotkey_listener.stop()
    hotkey_listener = keyboard.GlobalHotKeys({HOTKEY_STRING: lambda: toggle_recording(icon)})
    hotkey_listener.start()

def on_quit(icon, item):
    global hotkey_listener
    logging.info("Arrêt de l'application...")
    if hotkey_listener: hotkey_listener.stop()
    if audio_stream: audio_stream.close()
    icon.stop()

def main():
    global google_credentials
    google_credentials = get_google_credentials()
    if not google_credentials:
        return

    logging.info("Lancement de l'application en mode barre d'état système.")
    menu = pystray.Menu(pystray.MenuItem('Quitter', on_quit))
    icon = pystray.Icon(
        'VoiceTool',
        icon=create_icon('white', 'gray'), 
        title='Voice Tool (Ctrl+Alt+S) - Google Cloud',
        menu=menu
    )
    setup_hotkey(icon)
    icon.run()

if __name__ == "__main__":
    main()