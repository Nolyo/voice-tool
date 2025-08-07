import json
import logging
import os
import time
from typing import List, Dict, Any

from .paths import HISTORY_FILE


def load_transcription_history() -> List[Dict[str, Any]]:
    try:
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and "transcriptions" in data:
                    logging.info(f"Historique chargé: {len(data['transcriptions'])} transcriptions")
                    return data["transcriptions"]
                return []
        return []
    except Exception as exc:
        logging.error(f"Erreur lors du chargement de l'historique: {exc}")
        return []


def save_transcription_history(transcriptions: List[Dict[str, Any]]) -> bool:
    try:
        history_data = {
            "version": "1.0",
            "created": time.strftime("%Y-%m-%d %H:%M:%S"),
            "transcriptions": transcriptions,
        }
        os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history_data, f, ensure_ascii=False, indent=2)
        logging.info(f"Historique sauvegardé: {len(transcriptions)} transcriptions")
        return True
    except Exception as exc:
        logging.error(f"Erreur lors de la sauvegarde de l'historique: {exc}")
        return False


def add_to_transcription_history(current_history: List[Dict[str, Any]], text: str) -> Dict[str, Any]:
    item = {
        "text": text,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "date": time.strftime("%Y-%m-%d"),
    }
    current_history.append(item)
    if len(current_history) > 1000:
        current_history[:] = current_history[-1000:]
    save_transcription_history(current_history)
    return item


