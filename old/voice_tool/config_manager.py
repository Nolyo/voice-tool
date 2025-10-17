import logging
import os
from dataclasses import dataclass
from typing import Dict, Any, List, Optional

from dotenv import load_dotenv


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, os.pardir))


def load_env_from_project_root() -> None:
    """Charge le fichier .env présent à la racine du projet (mode dev), si disponible."""
    env_path = os.path.join(PROJECT_ROOT, ".env")
    if os.path.exists(env_path):
        load_dotenv(env_path, override=False)
        logging.info("Fichier .env chargé depuis la racine du projet (dev)")
    else:
        logging.info("Aucun fichier .env trouvé à la racine du projet (dev)")


def _arg_value(argv: List[str], flag: str) -> Optional[str]:
    try:
        if flag in argv:
            idx = argv.index(flag)
            if idx >= 0 and idx + 1 < len(argv):
                return argv[idx + 1]
    except Exception:
        pass
    return None


def _load_env_file_if_exists(path: str, label: str) -> bool:
    try:
        if path and os.path.exists(path):
            # override=False: on conserve la priorité aux fichiers chargés plus tôt
            load_dotenv(path, override=False)
            logging.info(f"Fichier .env chargé ({label}): {path}")
            return True
    except Exception as exc:
        logging.error(f"Erreur chargement .env ({label}) {path}: {exc}")
    return False


def load_env_multi(argv: Optional[List[str]] = None) -> None:
    """Charge les variables d'environnement selon un ordre de priorité adapté à la prod.

    Ordre (le premier trouvé gagne; override=False à chaque étape):
      1) --env <path>
      2) .env à côté de l'exécutable (si packagé)
      3) .env dans AppData/VoiceTool
      4) Variables d'environnement du système (implicite)
      5) .env à la racine du projet (mode dev)

    Ne crée ni ne modifie jamais les .env de l'utilisateur.
    """
    argv = argv or []

    # 1) Paramètre CLI --env <path>
    cli_env = _arg_value(argv, "--env")
    if cli_env:
        _load_env_file_if_exists(cli_env, "CLI --env")

    # 2) .env à côté de l'exécutable si packagé
    try:
        import sys as _sys
        if getattr(_sys, "frozen", False):
            exe_dir = os.path.dirname(_sys.executable)
            _load_env_file_if_exists(os.path.join(exe_dir, ".env"), "dossier de l'exécutable")
    except Exception:
        pass

    # 3) .env dans AppData/VoiceTool
    try:
        from .paths import APP_DATA_DIR as _APP
        _load_env_file_if_exists(os.path.join(_APP, ".env"), "AppData/VoiceTool")
    except Exception:
        pass

    # 4) ENV système: rien à faire (déjà présents si définis)

    # 5) .env du projet en dev
    load_env_from_project_root()


@dataclass
class SystemConfig:
    # Les hotkeys ont migré vers les User Settings (AppData)
    # On conserve des défauts vides pour garder la structure si besoin
    record_hotkey: str = ""
    open_window_hotkey: str = ""


CONFIG_FILE_NAME = "config.json"


def load_system_config() -> Dict[str, Any]:
    """Charge la configuration système depuis config.json et fusionne avec les defaults."""
    import json

    defaults = SystemConfig().__dict__
    config_path = os.path.join(PROJECT_ROOT, CONFIG_FILE_NAME)

    try:
        if not os.path.exists(config_path):
            # Ne plus créer automatiquement: l'app peut fonctionner sans config.json
            logging.info("Aucun fichier de configuration système trouvé (ce n'est pas bloquant)")
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
        logging.info(f"Paramètres système sauvegardés → {config_path} : {config}")
        return True
    except Exception as exc:
        logging.error(f"Erreur lors de la sauvegarde de la configuration: {exc}")
        return False


