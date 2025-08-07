import json
import logging
import os
import time
from typing import Dict, Any

from .paths import USER_SETTINGS_FILE


def default_user_settings() -> Dict[str, Any]:
    return {
        "enable_sounds": True,
        "paste_at_cursor": False,
        "auto_start": False,
        "transcription_provider": "Google",
        "language": "fr-FR",
        "smart_formatting": True,
    }


def load_user_settings() -> Dict[str, Any]:
    try:
        if os.path.exists(USER_SETTINGS_FILE):
            with open(USER_SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and "settings" in data:
                    defaults = default_user_settings()
                    settings = {**defaults, **data["settings"]}
                    return settings
                return default_user_settings()
        # init file with defaults
        settings = default_user_settings()
        save_user_settings(settings)
        return settings
    except Exception as exc:
        logging.error(f"Erreur lors du chargement des paramètres utilisateur: {exc}")
        return default_user_settings()


def save_user_settings(settings: Dict[str, Any]) -> bool:
    try:
        settings_data = {
            "version": "1.0",
            "created": time.strftime("%Y-%m-%d %H:%M:%S"),
            "settings": settings,
        }
        os.makedirs(os.path.dirname(USER_SETTINGS_FILE), exist_ok=True)
        with open(USER_SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(settings_data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as exc:
        logging.error(f"Erreur lors de la sauvegarde des paramètres utilisateur: {exc}")
        return False


