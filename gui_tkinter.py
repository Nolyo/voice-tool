
import tkinter as tk
import threading
import time
import numpy as np
import logging
from tkinter import ttk
import pyperclip
import os

logging.basicConfig(level=logging.INFO)

class VisualizerWindowTkinter:
    def __init__(self, icon_path=None):
        self.root = tk.Tk()
        self.root.withdraw() # Cache la fenêtre principale Tkinter par défaut
        self.icon_path = icon_path
        
        # Appliquer l'icône à la fenêtre root
        if self.icon_path:
            self.set_window_icon(self.root)
        
        self.main_window = None # Pour garder une référence à la fenêtre principale
        self.log_text_widget = None # Pour le widget qui affichera les logs
        self.history_listbox = None # Pour la Listbox de l'historique
        
        self.window = tk.Toplevel(self.root)
        self.window.overrideredirect(True) # Supprime la barre de titre et les bordures
        self.window.attributes("-topmost", True) # Toujours au-dessus
        self.window.geometry("250x60") # Taille fixe plus petite
        self.window.configure(bg='black') # Fond noir
        self.window.attributes("-alpha", 0.5) # Opacité réduite (50%) pour un fond moins présent

        self.center_window()

        # Cacher la fenêtre au démarrage pour qu'elle n'apparaisse que lors de l'enregistrement
        self.window.withdraw()

        # Utilise place() pour le canvas aussi, pour une gestion d'empilement cohérente
        self.canvas = tk.Canvas(self.window, width=250, height=60, bg='black', highlightthickness=0)
        self.canvas.place(x=0, y=0, relwidth=1, relheight=1)

        self.status_label = tk.Label(self.window, text="", fg="white", bg="black", font=("Arial", 14, "bold"))
        self.status_label.place(relx=0.5, rely=0.5, anchor=tk.CENTER)
        # Initialement, le label est en dessous du canvas
        self.status_label.lower() 

        self.audio_levels = np.zeros(40) # Moins de barres pour une fenêtre plus petite
        self.bar_width = 250 / len(self.audio_levels)

        self.current_mode = "idle"

        # Logique de déplacement
        self._drag_data = {"x": 0, "y": 0}
        self.window.bind('<ButtonPress-1>', self._start_drag)
        self.window.bind('<B1-Motion>', self._do_drag)

        logging.info("VisualizerWindowTkinter initialisée.")

    def set_window_icon(self, window):
        """Définit l'icône personnalisée pour une fenêtre Tkinter."""
        try:
            if self.icon_path and os.path.exists(self.icon_path):
                window.iconbitmap(self.icon_path)
                logging.info(f"Icône appliquée: {self.icon_path}")
            else:
                logging.warning("Impossible de trouver l'icône personnalisée")
        except Exception as e:
            logging.error(f"Erreur lors de l'application de l'icône: {e}")

    def center_window(self):
        self.window.update_idletasks()
        x = self.window.winfo_screenwidth() // 2 - self.window.winfo_width() // 2
        y = self.window.winfo_screenheight() // 2 - self.window.winfo_height() // 2
        self.window.geometry(f"+{x}+{y}")

    def _start_drag(self, event):
        self._drag_data["x"] = event.x
        self._drag_data["y"] = event.y

    def _do_drag(self, event):
        x = self.window.winfo_x() + (event.x - self._drag_data["x"])
        y = self.window.winfo_y() + (event.y - self._drag_data["y"])
        self.window.geometry(f"+{x}+{y}")

    def update_visualizer(self, new_level):
        if self.current_mode == "recording":
            self.audio_levels = np.roll(self.audio_levels, -1)
            self.audio_levels[-1] = new_level
            self.draw_visualizer()

    def draw_visualizer(self):
        self.canvas.delete("all") # Efface les anciennes barres
        for i, level in enumerate(self.audio_levels):
            x1 = i * self.bar_width
            x2 = x1 + (self.bar_width * 0.8) # 80% de la largeur pour l'espacement
            bar_height = int(level * self.canvas.winfo_height() * 0.7) # Hauteur des barres réduite
            y1 = self.canvas.winfo_height() - bar_height
            y2 = self.canvas.winfo_height()

            # Couleurs pour le dégradé (Tkinter ne gère pas les dégradés directement sur les rectangles)
            # On simplifie avec une couleur basée sur le niveau
            if level < 0.33: color = "#00FF00" # Vert
            elif level < 0.66: color = "#FFFF00" # Jaune
            else: color = "#FF0000" # Rouge

            self.canvas.create_rectangle(x1, y1, x2, y2, fill=color, outline=color)

    def set_mode(self, mode):
        logging.info(f"GUI Tkinter: Changement de mode vers: {mode}")
        self.current_mode = mode
        if mode == "recording":
            self.canvas.tkraise() # Met le canvas au-dessus
            self.status_label.lower() # Cache le label
            self.draw_visualizer()
        elif mode == "processing":
            self.status_label.config(text="Traitement...")
            self.status_label.tkraise() # Met le label au-dessus
            # self.canvas.lower() # Plus nécessaire, tkraise() gère l'empilement
        else: # idle mode
            # En mode idle, on peut cacher les deux ou s'assurer que le label est en dessous
            self.status_label.lower()
            # self.canvas.lower() # Plus nécessaire

    def show_status(self, status_type):
        if status_type == "success":
            self.status_label.config(text="✔ Succès !", fg="lightgreen")
        elif status_type == "error":
            self.status_label.config(text="❌ Erreur !", fg="red")
        self.status_label.tkraise() # Met le label au-dessus
        self.window.after(2000, lambda: self.status_label.lower()) # Cache après 2s
        self.window.after(2000, lambda: self.set_mode("idle")) # Retourne au mode idle

    def show(self):
        self.window.deiconify() # Affiche la fenêtre

    def hide(self):
        self.window.withdraw() # Cache la fenêtre

    def close(self):
        # self.root.quit() # Quitte la boucle principale Tkinter
        self.root.destroy() # Détruit la fenêtre root et termine la boucle

    def add_log_message(self, message):
        """Ajoute un message de log au widget Text de la fenêtre principale, de manière thread-safe."""
        if self.log_text_widget and self.log_text_widget.winfo_exists():
            # La mise à jour de l'UI doit être planifiée dans la boucle principale de Tkinter
            def append_message():
                self.log_text_widget.config(state='normal') # Autoriser l'écriture
                self.log_text_widget.insert(tk.END, message + '\n')
                self.log_text_widget.config(state='disabled') # Bloquer l'écriture
                self.log_text_widget.see(tk.END) # Faire défiler jusqu'en bas
            self.root.after(0, append_message)

    def add_transcription_to_history(self, history_item):
        """Ajoute une nouvelle transcription à la Listbox de l'historique, de manière thread-safe."""
        if self.history_listbox and self.history_listbox.winfo_exists():
            def insert_item():
                # Gérer à la fois l'ancien format (string) et le nouveau (dict)
                if isinstance(history_item, dict):
                    display_text = f"[{history_item['timestamp']}] {history_item['text']}"
                    actual_text = history_item['text']
                else:
                    # Rétrocompatibilité avec l'ancien format
                    display_text = str(history_item)
                    actual_text = str(history_item)
                
                # Stocker le texte réel dans une structure de données associée
                index = self.history_listbox.size()
                self.history_listbox.insert(tk.END, display_text)
                
                # Stocker le texte réel pour la copie (utilise un attribut personnalisé)
                if not hasattr(self.history_listbox, 'text_data'):
                    self.history_listbox.text_data = {}
                self.history_listbox.text_data[index] = actual_text
                
                self.history_listbox.see(tk.END) # Faire défiler jusqu'au nouvel élément
            self.root.after(0, insert_item)

    def _copy_history_selection(self):
        """Copie l'élément sélectionné dans la Listbox de l'historique."""
        if not self.history_listbox:
            return
        
        selected_indices = self.history_listbox.curselection()
        if not selected_indices:
            logging.info("Aucun élément sélectionné dans l'historique.")
            return
        
        selected_index = selected_indices[0]
        
        # Utiliser le texte stocké si disponible, sinon fallback sur le texte affiché
        if hasattr(self.history_listbox, 'text_data') and selected_index in self.history_listbox.text_data:
            selected_text = self.history_listbox.text_data[selected_index]
        else:
            selected_text = self.history_listbox.get(selected_index)
        
        pyperclip.copy(selected_text)
        logging.info(f"Texte copié depuis l'historique : '{selected_text[:40]}...'")

    def _delete_history_selection(self):
        """Supprime l'élément sélectionné de l'historique."""
        if not self.history_listbox:
            return
        
        selected_indices = self.history_listbox.curselection()
        if not selected_indices:
            logging.info("Aucun élément sélectionné pour suppression.")
            return
        
        selected_index = selected_indices[0]
        
        # Confirmer la suppression
        import tkinter.messagebox as msgbox
        if msgbox.askyesno("Confirmation", "Êtes-vous sûr de vouloir supprimer cette transcription ?"):
            # Supprimer de la listbox
            self.history_listbox.delete(selected_index)
            
            # Supprimer des données associées
            if hasattr(self.history_listbox, 'text_data') and selected_index in self.history_listbox.text_data:
                del self.history_listbox.text_data[selected_index]
                
                # Réorganiser les indices
                new_text_data = {}
                for old_idx, text in self.history_listbox.text_data.items():
                    if old_idx > selected_index:
                        new_text_data[old_idx - 1] = text
                    else:
                        new_text_data[old_idx] = text
                self.history_listbox.text_data = new_text_data
            
            # Supprimer de l'historique global et sauvegarder
            import main
            if selected_index < len(main.transcription_history):
                deleted_item = main.transcription_history.pop(selected_index)
                main.save_transcription_history(main.transcription_history)
                logging.info(f"Transcription supprimée : '{str(deleted_item)[:40]}...'")

    def _quit_application(self):
        """Ferme complètement l'application après confirmation."""
        import tkinter.messagebox as msgbox
        if msgbox.askyesno("Fermer l'application", 
                          "Êtes-vous sûr de vouloir fermer complètement Voice Tool ?\n\nL'application se fermera et ne fonctionnera plus en arrière-plan."):
            logging.info("Fermeture complète de l'application demandée depuis l'interface")
            
            # Appeler directement la fonction on_quit qui fait tout le nettoyage
            import main
            if main.global_icon_pystray:
                # Utiliser la fonction on_quit existante qui gère proprement la fermeture
                main.on_quit(main.global_icon_pystray, None)
            else:
                # Fallback si l'icône n'est pas disponible
                import sys
                sys.exit(0)

    def _on_history_double_click(self, event):
        """Copie automatiquement l'élément sur lequel on double-clique."""
        self._copy_history_selection()

    def _on_history_right_click(self, event):
        """Affiche le menu contextuel au clic droit."""
        # Sélectionner l'élément sous le curseur
        index = self.history_listbox.nearest(event.y)
        if index >= 0:
            self.history_listbox.selection_clear(0, tk.END)
            self.history_listbox.selection_set(index)
            self.history_listbox.activate(index)
            
            # Créer le menu contextuel
            context_menu = tk.Menu(self.root, tearoff=0, bg="#2b2b2b", fg="white", 
                                 activebackground="#0078d7", activeforeground="white",
                                 relief=tk.FLAT, borderwidth=1)
            
            context_menu.add_command(label="📋 Copier", command=self._copy_history_selection)
            context_menu.add_separator()
            context_menu.add_command(label="🗑️ Supprimer", command=self._delete_history_selection, 
                                   foreground="#dc3545")
            
            # Afficher le menu à la position du curseur
            try:
                context_menu.tk_popup(event.x_root, event.y_root)
            finally:
                context_menu.grab_release()


    def create_main_interface_window(self, history=None, current_config=None, save_callback=None):
        """Crée et affiche l'interface principale avec onglets (Historique/Logs, Paramètres)."""
        # Vérifie si la fenêtre n'est pas déjà ouverte pour éviter les doublons
        if self.main_window and self.main_window.winfo_exists():
            self.main_window.lift() # Si elle existe, la mettre au premier plan
            self.main_window.focus_force() # Lui donner le focus
            return

        self.main_window = tk.Toplevel(self.root)
        self.main_window.title("Voice Tool")
        self.main_window.geometry("800x500")
        
        # Définir l'icône personnalisée
        self.set_window_icon(self.main_window)
        
        self.main_window.update_idletasks()
        x = self.root.winfo_screenwidth() // 2 - self.main_window.winfo_width() // 2
        y = self.root.winfo_screenheight() // 2 - self.main_window.winfo_height() // 2
        self.main_window.geometry(f"+{x}+{y}")
        self.main_window.configure(bg="#2b2b2b")

        # --- Création des onglets ---
        notebook = ttk.Notebook(self.main_window)
        notebook.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # --- Onglet 1: Historique & Logs ---
        main_panel_frame = tk.Frame(notebook, bg="#2b2b2b")
        notebook.add(main_panel_frame, text='  Historique & Logs  ')
        paned_window = tk.PanedWindow(main_panel_frame, orient=tk.HORIZONTAL, sashrelief=tk.RAISED, bg="#3c3c3c")
        paned_window.pack(fill=tk.BOTH, expand=True)
        # Panneau de gauche : Historique
        history_frame = tk.Frame(paned_window, bg="#2b2b2b"); history_frame.pack(fill=tk.BOTH, expand=True)
        tk.Label(history_frame, text="Historique des transcriptions", fg="white", bg="#2b2b2b", font=("Arial", 11, "bold")).pack(pady=(5, 10))
        listbox_frame = tk.Frame(history_frame); listbox_frame.pack(fill=tk.BOTH, expand=True, padx=5)
        history_scrollbar = tk.Scrollbar(listbox_frame); history_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.history_listbox = tk.Listbox(listbox_frame, yscrollcommand=history_scrollbar.set, bg="#3c3c3c", fg="white", selectbackground="#0078d7", relief=tk.FLAT, borderwidth=0, highlightthickness=0, exportselection=False)
        self.history_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        history_scrollbar.config(command=self.history_listbox.yview)
        
        # Événements pour la listbox de l'historique
        self.history_listbox.bind("<Double-Button-1>", self._on_history_double_click)
        self.history_listbox.bind("<Button-3>", self._on_history_right_click)  # Clic droit
        # Charger l'historique avec support du nouveau format
        if history:
            self.history_listbox.text_data = {}
            for index, item in enumerate(history):
                if isinstance(item, dict):
                    display_text = f"[{item['timestamp']}] {item['text']}"
                    actual_text = item['text']
                else:
                    # Rétrocompatibilité avec l'ancien format
                    display_text = str(item)
                    actual_text = str(item)
                
                self.history_listbox.insert(tk.END, display_text)
                self.history_listbox.text_data[index] = actual_text
        
        # Indication pour les interactions avec l'historique
        help_frame = tk.Frame(history_frame, bg="#2b2b2b")
        help_frame.pack(pady=(10,5), padx=5, fill=tk.X)
        
        tk.Label(help_frame, text="💡 Double-clic pour copier • Clic droit pour le menu", 
                fg="#888888", bg="#2b2b2b", font=("Arial", 9), justify=tk.CENTER).pack()
        
        # Message informatif pour le raccourci d'enregistrement
        shortcut_frame = tk.Frame(history_frame, bg="#1e1e1e", relief=tk.RAISED, bd=1)
        shortcut_frame.pack(pady=(10,10), padx=5, fill=tk.X)
        
        tk.Label(shortcut_frame, text="🎤", fg="#FF6B6B", bg="#1e1e1e", font=("Arial", 16)).pack(pady=(8,2))
        tk.Label(shortcut_frame, text="Pour démarrer/arrêter l'enregistrement", fg="white", bg="#1e1e1e", font=("Arial", 10)).pack()
        
        # Afficher le raccourci configuré
        import main
        current_shortcut = main.config.get('record_hotkey', '<ctrl>+<alt>+s')
        tk.Label(shortcut_frame, text=f"Appuyez sur {current_shortcut}", fg="#4ECDC4", bg="#1e1e1e", font=("Arial", 11, "bold")).pack(pady=(2,8))
        paned_window.add(history_frame, width=560)  # 70% de 800px = 560px
        # Panneau de droite : Logs
        log_frame = tk.Frame(paned_window, bg="#2b2b2b"); log_frame.pack(fill=tk.BOTH, expand=True)
        tk.Label(log_frame, text="Logs de l'application", fg="white", bg="#2b2b2b", font=("Arial", 11, "bold")).pack(pady=(5, 10))
        text_frame = tk.Frame(log_frame); text_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=(0,5))
        log_scrollbar = tk.Scrollbar(text_frame); log_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.log_text_widget = tk.Text(text_frame, wrap=tk.WORD, state='disabled', yscrollcommand=log_scrollbar.set, bg="#1e1e1e", fg="white", font=("Consolas", 10), relief=tk.FLAT, borderwidth=0, highlightthickness=0)
        self.log_text_widget.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        log_scrollbar.config(command=self.log_text_widget.yview)
        paned_window.add(log_frame)

        # --- Onglet 2: Paramètres ---
        settings_frame = tk.Frame(notebook, bg="#2b2b2b", padx=20, pady=20)
        notebook.add(settings_frame, text='  Paramètres  ')
        
        # === SECTION AUDIO ===
        tk.Label(settings_frame, text="🔊 Audio", fg="#4CAF50", bg="#2b2b2b", font=("Arial", 12, "bold")).pack(anchor='w', pady=(0, 10))
        
        # Option sons
        sounds_var = tk.BooleanVar()
        if current_config: sounds_var.set(current_config.get("enable_sounds", True))
        sounds_check = tk.Checkbutton(settings_frame, text="Activer les sons d'interface", 
                                     variable=sounds_var, fg="white", bg="#2b2b2b", 
                                     selectcolor="#3c3c3c", activebackground="#2b2b2b", 
                                     activeforeground="white")
        sounds_check.pack(anchor='w', pady=(0, 15))
        
        # Séparateur
        separator1 = tk.Frame(settings_frame, height=1, bg="#555555")
        separator1.pack(fill=tk.X, pady=(0, 20))
        
        # === SECTION RACCOURCIS ===
        tk.Label(settings_frame, text="⌨️ Raccourcis clavier", fg="#2196F3", bg="#2b2b2b", font=("Arial", 12, "bold")).pack(anchor='w', pady=(0, 10))
        
        # Raccourci Enregistrement
        tk.Label(settings_frame, text="Raccourci pour Démarrer/Arrêter l'enregistrement :", fg="white", bg="#2b2b2b").pack(anchor='w', pady=(0,2))
        record_hotkey_entry = tk.Entry(settings_frame, bg="#3c3c3c", fg="white", relief=tk.FLAT, insertbackground="white")
        record_hotkey_entry.pack(fill=tk.X, pady=(0, 15))
        if current_config: record_hotkey_entry.insert(0, current_config.get("record_hotkey", ""))

        # Raccourci Ouvrir Fenêtre  
        tk.Label(settings_frame, text="Raccourci pour Ouvrir cette fenêtre :", fg="white", bg="#2b2b2b").pack(anchor='w', pady=(0,2))
        open_hotkey_entry = tk.Entry(settings_frame, bg="#3c3c3c", fg="white", relief=tk.FLAT, insertbackground="white")
        open_hotkey_entry.pack(fill=tk.X, pady=(0, 15))
        if current_config: open_hotkey_entry.insert(0, current_config.get("open_window_hotkey", ""))
        
        # Séparateur
        separator2 = tk.Frame(settings_frame, height=1, bg="#555555")
        separator2.pack(fill=tk.X, pady=(0, 15))
        
        # Aide pour les raccourcis (à la fin)
        help_text = "Modificateurs: <ctrl>, <alt>, <shift>, <cmd> (Mac)\nTouches spéciales: <space>, <tab>, <enter>, <esc>, <f1>-<f12>\nExemples: <ctrl>+<shift>+r, <alt>+<space>, <f9>"
        help_label = tk.Label(settings_frame, text=help_text, fg="#888888", bg="#2b2b2b", 
                             font=("Consolas", 8), justify=tk.LEFT)
        help_label.pack(anchor='w', pady=(10, 10))
        
        # Séparateur
        separator3 = tk.Frame(settings_frame, height=1, bg="#555555")
        separator3.pack(fill=tk.X, pady=(10, 15))
        
        # Bouton de fermeture complète (discret)
        quit_frame = tk.Frame(settings_frame, bg="#2b2b2b")
        quit_frame.pack(fill=tk.X, pady=(0, 5))
        
        tk.Button(quit_frame, text="⚠️ Fermer complètement l'application", 
                 command=self._quit_application, bg="#6c757d", fg="white", 
                 relief=tk.FLAT, activebackground="#5a6268", activeforeground="white",
                 font=("Arial", 9)).pack(side=tk.RIGHT)

        # Fonction pour sauvegarder la configuration
        def save_settings():
            new_config = {
                "record_hotkey": record_hotkey_entry.get().strip(),
                "open_window_hotkey": open_hotkey_entry.get().strip(),
                "enable_sounds": sounds_var.get()
            }
            if save_callback:
                save_callback(new_config)
                # Feedback visuel de sauvegarde
                save_button.config(text="✓ Sauvegardé !", bg="#28a745")
                self.main_window.after(2000, lambda: save_button.config(text="Sauvegarder", bg="#0078d7"))

        # Bouton de sauvegarde
        save_button = tk.Button(settings_frame, text="Sauvegarder", command=save_settings, 
                               bg="#0078d7", fg="white", relief=tk.FLAT, 
                               activebackground="#005a9e", activeforeground="white",
                               font=("Arial", 10, "bold"))
        save_button.pack(pady=20, padx=5, fill=tk.X)

        # S'assurer que la référence est nettoyée à la fermeture de la fenêtre
        self.main_window.protocol("WM_DELETE_WINDOW", lambda: (self.main_window.destroy(), setattr(self, 'main_window', None), setattr(self, 'log_text_widget', None), setattr(self, 'history_listbox', None), setattr(self, 'record_button', None)))

    def run(self):
        self.root.mainloop()

# --- Pour tester ce fichier seul ---
if __name__ == '__main__':
    window = VisualizerWindowTkinter()
    window.show()

    # Simule des données audio pour le test
    def simulate_audio():
        window.update_visualizer(np.random.rand())
        window.window.after(50, simulate_audio)

    window.set_mode("recording")
    simulate_audio()
    window.run()
