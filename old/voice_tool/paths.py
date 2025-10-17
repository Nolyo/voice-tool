import os
import platform


def get_app_data_dir() -> str:
    if platform.system() == "Windows":
        appdata = os.getenv("APPDATA", os.path.expanduser("~"))
        app_dir = os.path.join(appdata, "VoiceTool")
    else:
        app_dir = os.path.join(os.path.expanduser("~"), ".config", "VoiceTool")
    os.makedirs(app_dir, exist_ok=True)
    return app_dir


APP_DATA_DIR = get_app_data_dir()
HISTORY_FILE = os.path.join(APP_DATA_DIR, "transcription_history.json")
SOUNDS_DIR = os.path.join(APP_DATA_DIR, "sounds")
USER_SETTINGS_FILE = os.path.join(APP_DATA_DIR, "user_settings.json")
RECORDINGS_DIR = os.path.join(APP_DATA_DIR, "recordings")
os.makedirs(RECORDINGS_DIR, exist_ok=True)


