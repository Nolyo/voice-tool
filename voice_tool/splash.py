import customtkinter as ctk
import logging
import os
import platform
import ctypes
from PIL import Image


class SplashWindow:
    """Splash minimal non bloquant pour l'initialisation.

    Utilisation:
        splash = SplashWindow()
        splash.show("Chargement…")
        # ... tâches d'init; entre étapes:
        splash.set_message("Étape suivante…")
        splash.pump()
        # ...
        splash.close()
    """

    def __init__(self) -> None:
        # CustomTkinter global appearance
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        self.root = ctk.CTk()
        self.root.overrideredirect(True)
        self.root.configure(fg_color="#1C1C1C")
        self.root.attributes("-topmost", True)
        self._message = ctk.StringVar(value="")

        # Conteneur
        frame = ctk.CTkFrame(self.root, fg_color="#1C1C1C")
        frame.pack(fill="both", expand=True, padx=24, pady=20)

        # Logo (ico local si dispo)
        logo_img = None
        try:
            project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
            icon_path = os.path.join(project_root, "voice_tool_icon.ico")
            if os.path.exists(icon_path):
                pil = Image.open(icon_path)
                # carré raisonnable
                size = (48, 48)
                try:
                    pil = pil.resize(size)
                except Exception:
                    pass
                logo_img = ctk.CTkImage(light_image=pil, dark_image=pil, size=size)
        except Exception as exc:
            logging.error(f"Splash: chargement logo échoué: {exc}")

        # Conserver la référence pour éviter le GC
        self._logo_img = logo_img

        header = ctk.CTkFrame(frame, fg_color="#1C1C1C")
        header.pack(pady=(0, 8))
        if self._logo_img is not None:
            ctk.CTkLabel(header, image=self._logo_img, text="").pack(side="left", padx=(0, 10))
        title = ctk.CTkLabel(header, text="Voice Tool", text_color="#FFFFFF", font=("Arial", 16, "bold"))
        title.pack(side="left")

        # Message d'état
        self.msg_label = ctk.CTkLabel(frame, textvariable=self._message, text_color="#CCCCCC", font=("Arial", 10))
        self.msg_label.pack()

        # Animation points (léger)
        self._dots_label = ctk.CTkLabel(frame, text="", text_color="#4ECDC4", font=("Consolas", 11, "bold"))
        self._dots_label.pack(pady=(6, 0))
        self._anim_running = False

        # Messages "qui défilent" (cosmétique)
        self._roll_label = ctk.CTkLabel(frame, text="", text_color="#8AA6A3", font=("Arial", 10))
        self._roll_label.pack(pady=(10, 0))
        self._roll_msgs = [
            "Chargement de l'UI…",
            "Préparation des sons…",
            "Chargement de l'historique…",
            "Initialisation des accès API…",
            "Démarrage de l'icône système…",
            "Initialisation audio…",
        ]
        self._roll_idx = 0
        self._roll_running = False

        # Géométrie centrée
        self.root.update_idletasks()
        w, h = 440, 200
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        x = (sw - w) // 2
        y = (sh - h) // 2
        self.root.geometry(f"{w}x{h}+{x}+{y}")
        # Assurer topmost initial
        self._ensure_topmost()

    def _animate(self) -> None:
        if not self._anim_running:
            return
        try:
            import time as _t
            dots = "." * (int(_t.time() * 2) % 4)
            self._dots_label.configure(text=dots)
            self.root.after(250, self._animate)
        except Exception as exc:
            logging.error(f"Animation splash échouée: {exc}")

    def show(self, message: str = "") -> None:
        self.set_message(message)
        self._anim_running = True
        self._animate()
        self._roll_running = True
        self._animate_roll()
        # Réassurer le topmost plusieurs fois pendant le démarrage
        try:
            self._ensure_topmost()
            self.root.after(200, self._ensure_topmost)
            self.root.after(800, self._ensure_topmost)
        except Exception:
            pass
        self.pump()

    def set_message(self, message: str) -> None:
        try:
            self._message.set(message)
        except Exception:
            pass

    def pump(self) -> None:
        try:
            self.root.update_idletasks()
            self.root.update()
        except Exception:
            pass

    def _animate_roll(self) -> None:
        if not self._roll_running:
            return
        try:
            txt = self._roll_msgs[self._roll_idx % len(self._roll_msgs)] if self._roll_msgs else ""
            self._roll_label.configure(text=txt)
            self._roll_idx += 1
            self.root.after(650, self._animate_roll)
        except Exception as exc:
            logging.error(f"Animation messages splash échouée: {exc}")

    def close(self) -> None:
        try:
            self._anim_running = False
            self._roll_running = False
            self.root.destroy()
        except Exception:
            pass

    def _ensure_topmost(self) -> None:
        try:
            # Tk-level topmost + lift
            self.root.lift()
            try:
                self.root.attributes("-topmost", True)
            except Exception:
                pass
            # Windows: forcer véritable TOPMOST via WinAPI
            if platform.system() == 'Windows':
                try:
                    hwnd = self.root.winfo_id()
                    HWND_TOPMOST = -1
                    SWP_NOMOVE = 0x0002
                    SWP_NOSIZE = 0x0001
                    SWP_SHOWWINDOW = 0x0040
                    ctypes.windll.user32.SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW)
                except Exception:
                    pass
        except Exception:
            pass


