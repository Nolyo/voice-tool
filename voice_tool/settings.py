import json
import logging
import os
import time
from typing import Dict, Any

from .paths import USER_SETTINGS_FILE


def _project_root() -> str:
    # dossier parent du paquet voice_tool
    return os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))


def _load_template_settings_if_any() -> Dict[str, Any] | None:
    """Charge un template JSON de paramètres s'il existe à la racine du projet.

    Formats acceptés:
    - { "settings": { ... } }
    - { ... } (dict direct des réglages)
    """
    candidates = [
        os.path.join(_project_root(), "user_settings.template.json"),
        os.path.join(_project_root(), "voice_tool_user_settings.template.json"),
    ]
    for path in candidates:
        try:
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    if "settings" in data and isinstance(data["settings"], dict):
                        return data["settings"]
                    return data
        except Exception as exc:
            logging.error(f"Erreur lecture template paramètres: {path} -> {exc}")
    return None


def default_user_settings() -> Dict[str, Any]:
    return {
        "enable_sounds": True,
        "paste_at_cursor": False,
        "auto_start": False,
        "transcription_provider": "Google",
        "language": "fr-FR",
        "smart_formatting": True,
        "input_device_index": None,
        "record_hotkey": "<ctrl>+<alt>+s",
        "open_window_hotkey": "<ctrl>+<alt>+o",
        "record_mode": "toggle",  # 'toggle' ou 'ptt'
        "ptt_hotkey": "<ctrl>+<shift>+<space>",
        # Rétention des enregistrements
        "recordings_keep_last": 25,
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
        # Première exécution: tenter un template puis fallback sur defaults
        template_settings = _load_template_settings_if_any()
        if isinstance(template_settings, dict):
            settings = {**default_user_settings(), **template_settings}
        else:
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


