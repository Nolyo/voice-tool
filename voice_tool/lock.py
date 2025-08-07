import logging
import os
import platform
import tempfile
import time
from typing import Optional


LOCK_FILE_PATH = os.path.join(tempfile.gettempdir(), "voice_tool.lock")
COMMAND_FILE_PATH = os.path.join(tempfile.gettempdir(), "voice_tool_command.txt")


_lock_file: Optional[any] = None


def acquire_lock() -> bool:
    global _lock_file
    try:
        if platform.system() == "Windows":
            if os.path.exists(LOCK_FILE_PATH):
                try:
                    with open(LOCK_FILE_PATH, "r") as f:
                        pid = int(f.read().strip())
                    os.kill(pid, 0)
                    return False
                except (OSError, ValueError, ProcessLookupError):
                    os.remove(LOCK_FILE_PATH)
            _lock_file = open(LOCK_FILE_PATH, "w")
            _lock_file.write(str(os.getpid()))
            _lock_file.flush()
            return True
        else:
            import fcntl

            _lock_file = open(LOCK_FILE_PATH, "w")
            fcntl.lockf(_lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
            _lock_file.write(str(os.getpid()))
            _lock_file.flush()
            return True
    except (IOError, OSError):
        if _lock_file:
            _lock_file.close()
            _lock_file = None
        return False


def release_lock() -> None:
    global _lock_file
    if _lock_file:
        try:
            if platform.system() == "Windows":
                _lock_file.close()
                os.remove(LOCK_FILE_PATH)
            else:
                import fcntl

                fcntl.lockf(_lock_file, fcntl.LOCK_UN)
                _lock_file.close()
                os.remove(LOCK_FILE_PATH)
        except (IOError, OSError):
            pass
        _lock_file = None


def send_command_to_existing_instance(command: str) -> bool:
    try:
        with open(COMMAND_FILE_PATH, "w") as f:
            f.write(command)
        return True
    except (IOError, OSError):
        return False


def check_for_commands() -> bool:
    try:
        if os.path.exists(COMMAND_FILE_PATH):
            with open(COMMAND_FILE_PATH, "r") as f:
                command = f.read().strip()
            os.remove(COMMAND_FILE_PATH)
            logging.info(f"Commande reçue: {command}")
            return command == "open_window"
    except (IOError, OSError):
        pass
    return False


def start_command_monitor(open_window_callback) -> None:
    def monitor_loop():
        while True:
            try:
                if check_for_commands():
                    open_window_callback()
                time.sleep(0.5)
            except Exception as exc:
                logging.error(f"Erreur dans le monitoring des commandes: {exc}")
                time.sleep(1)

    import threading

    monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
    monitor_thread.start()
    logging.info("Monitoring des commandes démarré")


