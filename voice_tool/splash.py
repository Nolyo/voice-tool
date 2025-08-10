import customtkinter as ctk
import logging


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
        frame.pack(fill="both", expand=True, padx=22, pady=18)

        # Titre / Logo texte simple (icône graphique optionnelle plus tard)
        title = ctk.CTkLabel(frame, text="Voice Tool", text_color="#FFFFFF", font=("Arial", 14, "bold"))
        title.pack(pady=(0, 8))

        # Message d'état
        self.msg_label = ctk.CTkLabel(frame, textvariable=self._message, text_color="#CCCCCC", font=("Arial", 10))
        self.msg_label.pack()

        # Animation points (léger)
        self._dots_label = ctk.CTkLabel(frame, text="", text_color="#4ECDC4", font=("Consolas", 11, "bold"))
        self._dots_label.pack(pady=(6, 0))
        self._anim_running = False

        # Géométrie centrée
        self.root.update_idletasks()
        w, h = 300, 130
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        x = (sw - w) // 2
        y = (sh - h) // 2
        self.root.geometry(f"{w}x{h}+{x}+{y}")

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

    def close(self) -> None:
        try:
            self._anim_running = False
            self.root.destroy()
        except Exception:
            pass


