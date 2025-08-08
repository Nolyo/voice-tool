import tkinter as tk
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
        self.root = tk.Tk()
        self.root.overrideredirect(True)
        self.root.configure(bg="#1C1C1C")
        self.root.attributes("-topmost", True)
        self._message = tk.StringVar(value="")

        # Conteneur
        frame = tk.Frame(self.root, bg="#1C1C1C")
        frame.pack(fill=tk.BOTH, expand=True, padx=22, pady=18)

        # Titre / Logo texte simple (icône graphique optionnelle plus tard)
        title = tk.Label(frame, text="Voice Tool", fg="#FFFFFF", bg="#1C1C1C", font=("Arial", 14, "bold"))
        title.pack(pady=(0, 8))

        # Message d'état
        self.msg_label = tk.Label(frame, textvariable=self._message, fg="#CCCCCC", bg="#1C1C1C", font=("Arial", 10))
        self.msg_label.pack()

        # Animation points (léger)
        self._dots_label = tk.Label(frame, text="", fg="#4ECDC4", bg="#1C1C1C", font=("Consolas", 11, "bold"))
        self._dots_label.pack(pady=(6, 0))
        self._anim_running = False

        # Géométrie centrée
        self.root.update_idletasks()
        w, h = 280, 120
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


