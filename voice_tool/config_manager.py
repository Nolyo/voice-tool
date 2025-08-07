import logging
import os
from dataclasses import dataclass
from typing import Dict, Any

from dotenv import load_dotenv


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, os.pardir))


def load_env_from_project_root() -> None:
    """Charge le fichier .env présent à la racine du projet, si disponible."""
    env_path = os.path.join(PROJECT_ROOT, ".env")
    if os.path.exists(env_path):
        load_dotenv(env_path)
        logging.info("Fichier .env chargé depuis la racine du projet")
    else:
        logging.info("Aucun fichier .env trouvé à la racine du projet")


@dataclass
class SystemConfig:
    record_hotkey: str = "<ctrl>+<alt>+s"
    open_window_hotkey: str = "<ctrl>+<alt>+o"


CONFIG_FILE_NAME = "config.json"


def load_system_config() -> Dict[str, Any]:
    """Charge la configuration système depuis config.json et fusionne avec les defaults."""
    import json

    defaults = SystemConfig().__dict__
    config_path = os.path.join(PROJECT_ROOT, CONFIG_FILE_NAME)

    try:
        if not os.path.exists(config_path):
            logging.info(f"Fichier de configuration système non trouvé, création de {CONFIG_FILE_NAME}")
            with open(config_path, "w") as f:
                json.dump(defaults, f, indent=4)
            return dict(defaults)
        else:
            with open(config_path, "r") as f:
                loaded = json.load(f)
            # Nettoyage: ne garder que les clés système connues
            filtered = {k: loaded.get(k, v) for k, v in defaults.items()}
            return {**defaults, **filtered}
    except Exception as exc:
        logging.error(f"Erreur lors du chargement de la configuration: {exc}")
        return dict(defaults)


def save_system_config(config: Dict[str, Any]) -> bool:
    import json

    config_path = os.path.join(PROJECT_ROOT, CONFIG_FILE_NAME)
    try:
        with open(config_path, "w") as f:
            json.dump(config, f, indent=4)
        return True
    except Exception as exc:
        logging.error(f"Erreur lors de la sauvegarde de la configuration: {exc}")
        return False


