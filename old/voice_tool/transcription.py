import logging
import os
from typing import Optional

from google.cloud import speech
from google.oauth2.service_account import Credentials
import json as _json
import openai  # type: ignore


LANGUAGE_MAPPING = {
    "fr-FR": "fr",
    "en-US": "en",
    "es-ES": "es",
    "de-DE": "de",
    "it-IT": "it",
    "pt-PT": "pt",
    "nl-NL": "nl",
}


def get_google_credentials_from_env() -> Optional[Credentials]:
    required = ["PROJECT_ID", "PRIVATE_KEY_ID", "PRIVATE_KEY", "CLIENT_EMAIL", "CLIENT_ID"]
    missing = [k for k in required if not os.getenv(k)]

    # Fallback: GOOGLE_APPLICATION_CREDENTIALS → JSON service account
    if missing:
        gac = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if gac and os.path.exists(gac):
            try:
                with open(gac, "r", encoding="utf-8") as f:
                    info = _json.load(f)
                logging.info("Credentials Google chargés via GOOGLE_APPLICATION_CREDENTIALS")
                return Credentials.from_service_account_info(info)
            except Exception as exc:
                logging.error(f"Erreur lecture GOOGLE_APPLICATION_CREDENTIALS: {exc}")
        logging.error(f"Variables d'environnement manquantes: {missing}")
        return None

    info = {
        "type": "service_account",
        "project_id": os.getenv("PROJECT_ID"),
        "private_key_id": os.getenv("PRIVATE_KEY_ID"),
        "private_key": os.getenv("PRIVATE_KEY", "").replace("\\n", "\n"),
        "client_email": os.getenv("CLIENT_EMAIL"),
        "client_id": os.getenv("CLIENT_ID"),
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{os.getenv('CLIENT_EMAIL', '').replace('@', '%40')}",
    }
    return Credentials.from_service_account_info(info)


def transcribe_with_google(filename: str, sample_rate: int, language_code: str, credentials: Credentials) -> str:
    client = speech.SpeechClient(credentials=credentials)
    with open(filename, "rb") as audio_file:
        content = audio_file.read()
    audio = speech.RecognitionAudio(content=content)
    recog_config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
        sample_rate_hertz=sample_rate,
        language_code=language_code,
        enable_automatic_punctuation=True,
        model="latest_long",
    )
    logging.info(f"Envoi de l'audio à Google Cloud Speech (langue: {language_code})...")
    response = client.recognize(config=recog_config, audio=audio)
    if not response.results:
        raise RuntimeError("Aucun texte n'a pu être transcrit.")
    return response.results[0].alternatives[0].transcript


def transcribe_with_openai(filename: str, language_code: Optional[str]) -> str:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY manquant dans l'environnement.")
    client = openai.OpenAI(api_key=api_key)
    whisper_lang = LANGUAGE_MAPPING.get(language_code or "fr-FR", "fr")
    logging.info(f"OpenAI Whisper - Langue configurée: {whisper_lang}")
    with open(filename, "rb") as audio_file:
        response = client.audio.transcriptions.create(
            model="whisper-1", file=audio_file, language=whisper_lang
        )
    return response.text


