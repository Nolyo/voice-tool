import os
import json
import logging
from typing import Dict, Tuple, Optional

from dotenv import load_dotenv

from .paths import APP_DATA_DIR


REQUIRED_GOOGLE_KEYS = [
	"PROJECT_ID",
	"PRIVATE_KEY_ID",
	"PRIVATE_KEY",
	"CLIENT_EMAIL",
	"CLIENT_ID",
]

REQUIRED_OPENAI_KEY = "OPENAI_API_KEY"


def _appdata_env_path() -> str:
	return os.path.join(APP_DATA_DIR, ".env")


def validate_google_env() -> Tuple[bool, Dict[str, bool]]:
	"""Vérifie la présence des variables Google requises.

	Retourne (ok, details) où details mappe chaque clé -> True si présente.
	"""
	presence: Dict[str, bool] = {k: bool(os.getenv(k)) for k in REQUIRED_GOOGLE_KEYS}
	if all(presence.values()):
		return True, presence
	# Fallback: GOOGLE_APPLICATION_CREDENTIALS vers un JSON local
	gac = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
	if gac and os.path.exists(gac):
		return True, {**presence, "GOOGLE_APPLICATION_CREDENTIALS": True}
	return False, presence


def validate_openai_env() -> Tuple[bool, Dict[str, bool]]:
	"""Vérifie la présence de la clé OpenAI requise."""
	present = bool(os.getenv(REQUIRED_OPENAI_KEY))
	return present, {REQUIRED_OPENAI_KEY: present}


def parse_google_service_account_info(info: Dict[str, str]) -> Dict[str, str]:
	"""Extrait les clés d'env attendues depuis un dict JSON GCP.

	Attend un contenu de fichier de compte de service Google (service_account).
	"""
	return {
		"PROJECT_ID": info.get("project_id", ""),
		"PRIVATE_KEY_ID": info.get("private_key_id", ""),
		"PRIVATE_KEY": (info.get("private_key", "") or "").replace("\r\n", "\n"),
		"CLIENT_EMAIL": info.get("client_email", ""),
		"CLIENT_ID": info.get("client_id", ""),
	}


def load_google_json_credentials_from_string(json_str: str) -> Dict[str, str]:
	"""Charge un JSON de credentials Google depuis une chaîne et renvoie un mapping d'env."""
	data = json.loads(json_str)
	return parse_google_service_account_info(data)


def load_google_json_credentials_from_file(path: str) -> Dict[str, str]:
	"""Charge un JSON de credentials Google depuis un fichier et renvoie un mapping d'env."""
	with open(path, "r", encoding="utf-8") as f:
		data = json.load(f)
	return parse_google_service_account_info(data)


def _serialize_env_lines(env_map: Dict[str, str]) -> str:
	lines = []
	for key, value in env_map.items():
		if value is None:
			continue
		# Aplatir les retours à la ligne des clés privées pour stockage .env
		val = str(value)
		if key == "PRIVATE_KEY":
			val = val.replace("\r\n", "\n").replace("\n", "\\n")
		lines.append(f"{key}={val}")
	return "\n".join(lines) + "\n"


def save_env_to_appdata(env_map: Dict[str, str], override_process_env: bool = True) -> bool:
	"""Écrit/merge les variables dans AppData/.env puis recharge dans le process si demandé."""
	try:
		os.makedirs(APP_DATA_DIR, exist_ok=True)
		app_env_path = _appdata_env_path()
		# Fusion simple: recharger existant, écraser par nouvelles valeurs
		existing: Dict[str, str] = {}
		if os.path.exists(app_env_path):
			try:
				with open(app_env_path, "r", encoding="utf-8") as f:
					for line in f:
						line = line.strip()
						if not line or line.startswith("#"):
							continue
						if "=" in line:
							k, v = line.split("=", 1)
							existing[k] = v
			except Exception:
				pass
		updated = {**existing, **env_map}
		with open(app_env_path, "w", encoding="utf-8") as f:
			f.write(_serialize_env_lines(updated))
		logging.info(f".env mis à jour dans AppData: {app_env_path}")
		if override_process_env:
			try:
				load_dotenv(app_env_path, override=True)
				logging.info("Variables d'environnement rechargées dans le processus")
			except Exception as exc:
				logging.error(f"Échec du rechargement des variables d'environnement: {exc}")
		return True
	except Exception as exc:
		logging.error(f"Erreur lors de la sauvegarde du .env AppData: {exc}")
		return False


def set_google_application_credentials_path(json_path: str, also_extract: bool = False) -> bool:
	"""Définit GOOGLE_APPLICATION_CREDENTIALS dans AppData/.env.

	Si also_extract=True, parse aussi le JSON et écrit les 5 clés détaillées.
	"""
	try:
		env_map: Dict[str, str] = {"GOOGLE_APPLICATION_CREDENTIALS": json_path}
		if also_extract:
			try:
				parsed = load_google_json_credentials_from_file(json_path)
				env_map.update(parsed)
			except Exception as exc:
				logging.warning(f"Impossible de parser le JSON de credentials: {exc}")
		return save_env_to_appdata(env_map, override_process_env=True)
	except Exception as exc:
		logging.error(f"Erreur lors de la configuration des credentials Google: {exc}")
		return False


