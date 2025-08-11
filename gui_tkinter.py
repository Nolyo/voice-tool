
import tkinter as tk
import threading
import time
import numpy as np
import logging
from tkinter import ttk
import customtkinter as ctk
import pyperclip
import os
import platform
from PIL import ImageTk, Image
import sounddevice as sd
import traceback

logging.basicConfig(level=logging.INFO)

class VisualizerWindowTkinter:
    def __init__(self, icon_path=None):
        # Créer un root CTk dédié à l'application (ne pas réutiliser celui du Splash)
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")
        self.root = ctk.CTk()
        # Cacher le root immédiatement afin d'éviter tout flash de fenêtre 'tk' en arrière-plan
        try:
            self.root.attributes('-alpha', 0.0)
        except Exception:
            pass
        self.root.withdraw()  # Cache la fenêtre principale Tkinter par défaut
        self.root.title("Voice Tool")  # Définir le titre de l'application
        self.icon_path = icon_path
        
        # Appliquer l'icône à la fenêtre root
        if self.icon_path:
            self.set_window_icon(self.root)

        # Hook global pour capturer et loguer toute exception Tkinter
        def _report_callback_exception(exc, val, tb):
            try:
                logging.error("Exception Tkinter:")
                logging.error("".join(traceback.format_exception(exc, val, tb)))
            except Exception:
                pass
        try:
            self.root.report_callback_exception = _report_callback_exception
        except Exception:
            pass
        
        self.main_window = None # Pour garder une référence à la fenêtre principale
        self.log_text_widget = None # Pour le widget qui affichera les logs
        self.history_listbox = None # Déprécié: ancienne Listbox (conservée pour compat)
        self.history_tree = None  # Nouveau: Treeview pour l'historique
        self._tree_id_to_obj = {}  # map id->objet (dict/str) pour actions
        # Recherche et gestion d'historique (filtrage)
        self.history_search_var = ctk.StringVar(master=self.root)
        self._search_after_id = None
        self._history_master = []  # liste des items d'historique (objets d'origine)
        self._filtered_history_items = []  # vue filtrée courante
        # Watcher de fichier d'historique
        self._history_file_last_mtime = None
        self._history_watch_active = False
        
        self.window = ctk.CTkToplevel(self.root)
        self.window.title("Voice Tool - Visualizer")  # Titre pour la fenêtre de visualisation
        self.set_window_icon(self.window) # Appliquer l'icône à la fenêtre de visualisation
        self.window.overrideredirect(True) # Supprime la barre de titre et les bordures
        self.window.attributes("-topmost", True) # Toujours au-dessus
        self.window.geometry("420x26") # Fenêtre plus fine et large pour un look moderne
        # Utiliser la couleur de fond CTk pour un thème sombre moderne
        try:
            self.window.configure(fg_color='#1C1C1C')
        except Exception:
            self.window.configure(bg='#1C1C1C')
        self.window.attributes("-alpha", 0.95) # Légère transparence

        # --- Configuration pour éviter le vol de focus (Windows) ---
        if platform.system() == 'Windows':
            try:
                import ctypes
                # Style de fenêtre "tool window" pour ne pas apparaître dans la barre des tâches
                self.window.attributes("-toolwindow", True)
                
                # Constantes WinAPI
                GWL_EXSTYLE = -20
                WS_EX_NOACTIVATE = 0x08000000

                # Récupérer le handle de la fenêtre
                hwnd = self.window.winfo_id()
                
                # Récupérer les styles étendus actuels
                current_style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
                
                # Ajouter le style WS_EX_NOACTIVATE
                new_style = current_style | WS_EX_NOACTIVATE
                ctypes.windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, new_style)
                logging.info("Configuration anti-focus appliquée pour Windows.")
            except Exception as e:
                logging.error(f"Erreur lors de la configuration anti-focus: {e}")

        self.center_window()

        # Cacher la fenêtre au démarrage pour qu'elle n'apparaisse que lors de l'enregistrement
        self.window.withdraw()

        # Canvas pour le visualiseur (mince)
        self.canvas = tk.Canvas(self.window, width=420, height=26, bg='#1C1C1C', highlightthickness=0)
        self.canvas.place(x=0, y=0, relwidth=1, relheight=1)
        # Désactiver les liaisons implicites lourdes (scroll) qui peuvent bloquer le thread UI
        try:
            self.canvas.unbind_all("<MouseWheel>")
        except Exception:
            pass
        # Empêcher tout focus clavier sur la fenêtre du visualizer
        try:
            self.window.attributes("-disabled", True)
        except Exception:
            pass

        # Label pour les statuts (Succès, Erreur, etc.) en CTk pour cohérence visuelle
        self.status_label = ctk.CTkLabel(self.window, text="", text_color="#1C1C1C", fg_color="white", font=("Arial", 12, "bold"))
        self.status_label.place(relx=0.5, rely=0.5, anchor=tk.CENTER)
        self.status_label.lower() 

        self.audio_levels = np.zeros(84) # Plus de barres fines pour un effet fluide
        # Pic de niveau pour normalisation auto (AGC simple)
        self._level_peak = 0.1

        self.current_mode = "idle"

        # Logique de déplacement
        self._drag_data = {"x": 0, "y": 0}
        self.window.bind('<ButtonPress-1>', self._start_drag)
        self.window.bind('<B1-Motion>', self._do_drag)

        logging.info("VisualizerWindowTkinter initialisée.")

    def set_window_icon(self, window):
        """Définit l'icône personnalisée pour une fenêtre Tkinter de manière robuste."""
        try:
            if self.icon_path and os.path.exists(self.icon_path):
                # Ouvrir l'image avec Pillow
                pil_img = Image.open(self.icon_path)
                # Convertir en PhotoImage pour Tkinter
                photo_img = ImageTk.PhotoImage(pil_img, master=window)
                # Définir l'icône
                window.iconphoto(False, photo_img)
                # Garder une référence pour éviter que l'image ne soit supprimée par le garbage collector
                window.custom_icon = photo_img
                logging.info(f"Icône appliquée avec PhotoImage: {self.icon_path}")
            else:
                logging.warning("Impossible de trouver l'icône personnalisée")
        except Exception as e:
            logging.error(f"Erreur lors de l'application de l'icône: {e}")

    def center_window(self):
        """Positionne la fenêtre en bas de l'écran, au-dessus de la barre des tâches"""
        self.window.update_idletasks()
        
        # Centrer horizontalement
        screen_width = self.window.winfo_screenwidth()
        window_width = self.window.winfo_width()
        x = (screen_width - window_width) // 2
        
        # Positionner en bas, avec une marge de 50px au-dessus de la barre des tâches
        screen_height = self.window.winfo_screenheight()
        window_height = self.window.winfo_height()
        taskbar_height = 40  # Hauteur estimée de la barre des tâches Windows
        margin_bottom = 20   # Marge au-dessus de la barre des tâches
        y = screen_height - window_height - taskbar_height - margin_bottom
        
        self.window.geometry(f"+{x}+{y}")
        logging.info(f"Fenêtre positionnée en bas: {x}+{y}")

    def _start_drag(self, event):
        self._drag_data["x"] = event.x
        self._drag_data["y"] = event.y

    def _do_drag(self, event):
        x = self.window.winfo_x() + (event.x - self._drag_data["x"])
        y = self.window.winfo_y() + (event.y - self._drag_data["y"])
        self.window.geometry(f"+{x}+{y}")

    def update_visualizer(self, new_level):
        if self.current_mode == "recording":
            # Normalisation automatique des niveaux pour assurer un mouvement visible
            lvl = self._normalize_level(new_level)
            self.audio_levels = np.roll(self.audio_levels, -1)
            self.audio_levels[-1] = lvl
            self.draw_visualizer()

    def _normalize_level(self, level):
        """AGC simple: suit un pic décroissant et met à l'échelle le niveau.
        Tolère des niveaux très faibles (ex: flux float déjà entre -1..1).
        """
        try:
            x = float(level)
            if not np.isfinite(x):
                x = 0.0
            if x < 0:
                x = 0.0
            # Si les niveaux sont extrêmement faibles (ex. échelle 1/32768), amplifier fortement
            if x < 1e-3:
                x *= 2000.0
            # Suivi de pic avec décroissance
            self._level_peak = max(x, self._level_peak * 0.985)
            peak = self._level_peak if self._level_peak > 1e-6 else 1e-6
            y = x / peak
            # Un léger gain pour être bien visible
            y *= 1.2
            if y > 1.0:
                y = 1.0
            return y
        except Exception:
            return 0.0

    def draw_visualizer(self):
        self.canvas.delete("all")
        
        canvas_height = self.canvas.winfo_height()
        canvas_width = self.canvas.winfo_width()
        
        # Panneau arrondi noir en arrière-plan
        padding = 6
        radius = 10
        self._draw_rounded_panel(0, 0, canvas_width, canvas_height, radius=radius, fill="#000000", outline="#0e0e0e")
        
        num_bars = len(self.audio_levels)
        bar_width = 3  # Barres légèrement plus larges pour une meilleure lisibilité
        spacing = 2    # Espacement un peu plus généreux
        total_width = num_bars * (bar_width + spacing) - spacing
        usable_width = max(0, canvas_width - 2*(padding + radius))
        start_x = (canvas_width - usable_width) / 2 + max(0, (usable_width - total_width) / 2)

        # Ligne de base subtile
        try:
            self.canvas.create_line(padding+radius, canvas_height - padding - 2, canvas_width - padding - radius, canvas_height - padding - 2, fill="#2a2a2a")
        except Exception:
            pass

        for i, level in enumerate(self.audio_levels):
            x1 = start_x + i * (bar_width + spacing)
            x2 = x1 + bar_width
            
            # Courbe de croissance non-linéaire pour un effet plus doux
            # Courbe douce avec niveaux déjà normalisés 0..1
            available_h = max(2, (canvas_height - 2*padding - 4))
            lvl = max(0.0, min(1.0, float(level)))
            bar_height = int((lvl ** 0.5) * available_h)
            bar_height = max(2, bar_height) # Hauteur minimale un peu plus grande
            
            # Ancrer depuis le bas, avec marge intérieure
            y2 = canvas_height - padding - 2
            y1 = y2 - bar_height
            
            # Dégradé de couleur moderne
            color = self._get_color_gradient(level)
            
            # Dessiner des barres arrondies (style "pilule")
            self._draw_rounded_rect(x1, y1, x2, y2, radius=bar_width/2, fill=color)

    def _get_color_gradient(self, level):
        """Génère une couleur dans un dégradé en fonction du niveau audio."""
        # Définir les points de couleur du dégradé (de bas à haut niveau)
        colors = [
            (0.0, (78, 220, 208)),   # Turquoise clair (#4EDCD0)
            (0.3, (68, 156, 238)),   # Bleu électrique (#449CEE)
            (0.7, (255, 107, 107)),  # Corail vif (#FF6B6B)
            (1.0, (255, 255, 255))   # Blanc pour les pics extrêmes
        ]

        # Trouver les deux couleurs entre lesquelles interpoler
        for i in range(len(colors) - 1):
            p1, c1 = colors[i]
            p2, c2 = colors[i+1]
            if p1 <= level < p2:
                # Interpolation linéaire entre c1 et c2
                ratio = (level - p1) / (p2 - p1)
                r = int(c1[0] + ratio * (c2[0] - c1[0]))
                g = int(c1[1] + ratio * (c2[1] - c1[1]))
                b = int(c1[2] + ratio * (c2[2] - c1[2]))
                return f'#{r:02x}{g:02x}{b:02x}'
        
        # Si le niveau est au max (ou au-delà), retourner la dernière couleur
        return f'#{colors[-1][1][0]:02x}{colors[-1][1][1]:02x}{colors[-1][1][2]:02x}'

    def _draw_rounded_rect(self, x1, y1, x2, y2, radius=3, fill='#4CAF50'):
        """Dessine un rectangle avec des coins entièrement arrondis (pilule)."""
        # Pour des barres très fines, un simple rectangle rend mieux visuellement que des ovales
        self.canvas.create_rectangle(x1, y1, x2, y2, fill=fill, outline="")

    def _draw_rounded_panel(self, x1, y1, x2, y2, radius=10, fill="#000000", outline="#0e0e0e"):
        """Dessine un panneau arrondi (fond) avec rayon et couleur donnés."""
        try:
            w = max(0, x2 - x1)
            h = max(0, y2 - y1)
            r = max(0, min(radius, w/2, h/2))
            # Corps (rectangles centraux)
            self.canvas.create_rectangle(x1 + r, y1, x2 - r, y2, fill=fill, outline=outline)
            self.canvas.create_rectangle(x1, y1 + r, x2, y2 - r, fill=fill, outline=outline)
            # Coins (ovales)
            self.canvas.create_oval(x1, y1, x1 + 2*r, y1 + 2*r, fill=fill, outline=outline)
            self.canvas.create_oval(x2 - 2*r, y1, x2, y1 + 2*r, fill=fill, outline=outline)
            self.canvas.create_oval(x1, y2 - 2*r, x1 + 2*r, y2, fill=fill, outline=outline)
            self.canvas.create_oval(x2 - 2*r, y2 - 2*r, x2, y2, fill=fill, outline=outline)
        except Exception:
            pass

    def _draw_processing_interface(self):
        """Bannière de traitement compacte et moderne (panneau arrondi + texte + points animés)."""
        canvas_width = self.canvas.winfo_width()
        canvas_height = self.canvas.winfo_height()
        # Fond arrondi noir cohérent avec le visualizer
        padding = 6
        radius = 10
        self._draw_rounded_panel(0, 0, canvas_width, canvas_height, radius=radius, fill="#000000", outline="#0e0e0e")

        center_y = canvas_height // 2
        # Texte centré
        self.canvas.delete("processing_text")
        self.canvas.create_text(canvas_width//2 - 8, center_y, 
                                text="Traitement", 
                                fill='#4ECDC4', 
                                font=('Arial', 10, 'bold'),
                                tags="processing_text")

        # Animation de points de chargement, positionnée juste après le texte
        self._animate_processing_dots()

    def _animate_processing_dots(self):
        """Anime les points de traitement."""
        if self.current_mode != "processing":
            return
            
        canvas_width = self.canvas.winfo_width()
        canvas_height = self.canvas.winfo_height()
        center_y = canvas_height // 2

        # Supprimer les anciens points
        self.canvas.delete("processing_dots")

        # Points animés à droite du texte
        import time
        dot_count = int(time.time() * 2) % 4  # 2 cycles par seconde
        dots_text = "." * dot_count
        
        self.canvas.create_text(canvas_width//2 + 48, center_y, 
                                text=dots_text, 
                                fill='#4ECDC4', 
                                font=('Arial', 10, 'bold'),
                                tags="processing_dots")
        
        # Programmer la prochaine animation
        self.window.after(250, self._animate_processing_dots)


    def set_mode(self, mode):
        try:
            logging.info(f"GUI Tkinter: Changement de mode vers: {mode}")
            self.current_mode = mode
            if not self.canvas or not self.canvas.winfo_exists():
                return
            if mode == "recording":
                self.draw_visualizer()
            elif mode == "processing":
                # Toujours dessiner la bannière de traitement moderne
                self.canvas.delete("all")
                try:
                    self._draw_processing_interface()
                except Exception:
                    # Fallback minimal
                    cw = self.canvas.winfo_width(); ch = self.canvas.winfo_height()
                    self.canvas.create_rectangle(0, 0, cw, ch, fill='#1C1C1C', outline='')
                    self.canvas.create_text(cw//2, ch//2, text="Traitement…", fill='#4ECDC4', font=('Arial', 10, 'bold'))
            else:  # idle mode
                pass
        except Exception as e:
            logging.error(f"Erreur set_mode('{mode}'): {e}")

    def show_status(self, status_type):
        if status_type == "success":
            # Arrêter l'animation de traitement et effacer tout
            self.current_mode = "success"  # Stopper l'animation
            self.canvas.delete("all")
            # Cacher le label de statut pour éviter la superposition
            if self.status_label:
                self.status_label.place_forget()
            self._draw_success_interface()
            # Fermer la fenêtre après 3 secondes
            self.window.after(3000, self.hide)
        elif status_type == "error":
            # Arrêter l'animation de traitement et effacer tout
            self.current_mode = "error"  # Stopper l'animation
            self.canvas.delete("all")
            # Cacher le label de statut pour éviter la superposition
            if self.status_label:
                self.status_label.place_forget()
            self._draw_error_interface()
            # Fermer la fenêtre après 3 secondes même en cas d'erreur
            self.window.after(3000, self.hide)

    def _draw_success_interface(self):
        """Bannière de succès compacte et moderne (panneau arrondi + check + texte)."""
        self.canvas.delete("all")
        canvas_width = self.canvas.winfo_width()
        canvas_height = self.canvas.winfo_height()
        padding = 6
        radius = 10
        self._draw_rounded_panel(0, 0, canvas_width, canvas_height, radius=radius, fill="#000000", outline="#0e0e0e")

        center_y = canvas_height // 2
        # Mesurer la largeur du texte pour centrer l'ensemble (icône + espace + texte)
        try:
            import tkinter.font as tkfont
            font_spec = ('Arial', 11, 'bold')
            fnt = tkfont.Font(root=self.root, font=font_spec)
            text_w = fnt.measure("Copié dans le presse-papiers !")
        except Exception:
            font_spec = ('Arial', 11, 'bold')
            text_w = 48  # fallback approximatif

        icon_w = 12  # petit logo succès circulaire ~12px
        gap = 6
        total_w = icon_w + gap + text_w
        left_x = max(0, (canvas_width - total_w) // 2)

        # Dessiner un petit logo succès (cercle vert + check blanc) aligné verticalement
        icon_center_x = left_x + icon_w // 2
        # Cercle
        self.canvas.create_oval(icon_center_x - 6, center_y - 6,
                                icon_center_x + 6, center_y + 6,
                                fill='#1B5E20', outline='#2E7D32', width=1)
        # Check à l'intérieur
        self.canvas.create_line(icon_center_x - 3, center_y,
                                icon_center_x - 1, center_y + 3,
                                fill='white', width=2, capstyle='round')
        self.canvas.create_line(icon_center_x - 1, center_y + 3,
                                icon_center_x + 4, center_y - 3,
                                fill='white', width=2, capstyle='round')

        # Texte à droite de l'icône
        self.canvas.create_text(left_x + icon_w + gap, center_y,
                                text="Copié dans le presse-papiers !", fill='#4CAF50', font=font_spec, anchor='w')

    def _draw_error_interface(self):
        """Bannière d'erreur compacte et moderne (panneau arrondi + X + texte)."""
        self.canvas.delete("all")
        canvas_width = self.canvas.winfo_width()
        canvas_height = self.canvas.winfo_height()
        padding = 6
        radius = 10
        self._draw_rounded_panel(0, 0, canvas_width, canvas_height, radius=radius, fill="#000000", outline="#0e0e0e")

        center_y = canvas_height // 2
        cx = padding + radius
        # X minimaliste
        self.canvas.create_line(cx - 4, center_y - 4, cx + 4, center_y + 4, fill='#F44336', width=2, capstyle='round')
        self.canvas.create_line(cx + 4, center_y - 4, cx - 4, center_y + 4, fill='#F44336', width=2, capstyle='round')

        # Texte concis
        self.canvas.create_text(cx + 18, center_y, text="Échec", fill='#F44336', font=('Arial', 11, 'bold'), anchor='w')

    def show(self):
        """Affiche la fenêtre et s'assure qu'elle est correctement positionnée"""
        self.window.deiconify() # Affiche la fenêtre
        # S'assurer que la fenêtre est au premier plan et correctement positionnée
        self.window.lift()  # Mettre au premier plan
        self.window.attributes("-topmost", True)  # Réactiver topmost au cas où
        # Repositionner au cas où elle aurait dérivé
        self.center_window()

    def open_settings_tab(self):
        try:
            # Sélection différée jusqu'à ce que la fenêtre principale existe (évite les doubles ouvertures)
            def _select_when_ready():
                try:
                    if self.main_window and self.main_window.winfo_exists():
                        try:
                            self.main_window.lift()
                            self.main_window.focus_force()
                        except Exception:
                            pass
                        if hasattr(self, '_main_notebook') and hasattr(self, '_settings_tab'):
                            try:
                                self._main_notebook.select(self._settings_tab)
                            except Exception:
                                pass
                        return
                except Exception:
                    pass
                # Re-essayer un peu plus tard
                try:
                    self.root.after(120, _select_when_ready)
                except Exception:
                    pass

            _select_when_ready()
        except Exception:
            pass

    def hide(self):
        # Remettre le label de statut à sa position initiale
        if self.status_label:
            self.status_label.place(relx=0.5, rely=0.5, anchor=tk.CENTER)
            self.status_label.lower()
        # Remettre en mode idle
        self.current_mode = "idle"
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
        """Ajoute une nouvelle transcription à l'historique (toutes vues), de manière thread-safe."""
        def insert_item():
            try:
                # Mettre à jour la source locale
                self._history_master.append(history_item)
                # Si la table est visible ou la vue cartes, re-render via le pipeline unifié
                self._apply_history_filter()
            except Exception:
                pass
        try:
            self.root.after(0, insert_item)
        except Exception:
            insert_item()

    def _copy_history_selection(self):
        """Copie l'élément sélectionné dans la Listbox de l'historique."""
        if not (self.history_tree and self.history_tree.winfo_exists()):
            return
        # sélectionner la ligne sous le clic si nécessaire
        try:
            iid = self.history_tree.focus() or self.history_tree.selection()[0]
        except Exception:
            iid = None
        if not iid:
            logging.info("Aucun élément sélectionné dans l'historique.")
            return
        # Récupérer l'objet source depuis la map
        obj = self._tree_id_to_obj.get(iid)
        display_text, selected_text = self._history_to_display_and_actual(obj) if obj is not None else (None, None)
        
        pyperclip.copy(selected_text)
        logging.info(f"Texte copié depuis l'historique : '{selected_text[:40]}...'")
        # Si l'option est activée ET que Tk n'a pas le focus, coller automatiquement au curseur
        try:
            import main
            if main.get_setting('paste_at_cursor', False):
                # Si la fenêtre Tk a le focus, on évite de coller (l'utilisateur est dans l'UI)
                if self.root.focus_get() is None:
                    self.root.after(80, main.paste_to_cursor)
        except Exception as e:
            logging.error(f"Erreur lors du collage automatique: {e}")

    def _delete_history_selection(self):
        """Supprime l'élément sélectionné de l'historique."""
        if not (self.history_tree and self.history_tree.winfo_exists()):
            return
        try:
            iid = self.history_tree.focus() or self.history_tree.selection()[0]
        except Exception:
            iid = None
        if not iid:
            logging.info("Aucun élément sélectionné pour suppression.")
            return
        history_obj = self._tree_id_to_obj.get(iid)
        if history_obj is None:
            return
        
        # Confirmer la suppression
        import tkinter.messagebox as msgbox
        if msgbox.askyesno("Confirmation", "Êtes-vous sûr de vouloir supprimer cette transcription ?", parent=self.main_window if hasattr(self, 'main_window') else self.root):
            # Supprimer de l'historique global et sauvegarder
            import main
            # Trouver l'élément à supprimer en s'appuyant sur l'objet (dict/str)
            deleted_item = None
            if isinstance(history_obj, dict):
                # Chercher par timestamp+text si possible
                for i, it in enumerate(list(main.transcription_history)):
                    if isinstance(it, dict) and it.get('timestamp') == history_obj.get('timestamp') and it.get('text') == history_obj.get('text'):
                        deleted_item = main.transcription_history.pop(i)
                        break
            else:
                # Fallback pour ancien format (string): supprimer la première occurrence égale
                for i, it in enumerate(list(main.transcription_history)):
                    if not isinstance(it, dict) and str(it) == str(history_obj):
                        deleted_item = main.transcription_history.pop(i)
                        break

            if deleted_item is not None:
                # Sauvegarde robuste sous verrou côté main
                try:
                    if hasattr(main, 'history_lock'):
                        import threading
                        with main.history_lock:  # type: ignore[attr-defined]
                            main.save_transcription_history(main.transcription_history)
                    else:
                        main.save_transcription_history(main.transcription_history)
                except Exception:
                    main.save_transcription_history(main.transcription_history)
                # Mettre à jour la liste maître et la vue filtrée
                try:
                    self._history_master.remove(history_obj)
                except ValueError:
                    pass
                self._apply_history_filter()
                logging.info(f"Transcription supprimée : '{str(deleted_item)[:40]}...'")

    def _quit_application(self):
        """Ferme complètement l'application après confirmation."""
        import tkinter.messagebox as msgbox
        if msgbox.askyesno("Fermer l'application",
                           "Êtes-vous sûr de vouloir fermer complètement Voice Tool ?\n\nL'application se fermera et ne fonctionnera plus en arrière-plan.",
                           parent=self.main_window if hasattr(self, 'main_window') else self.root):
            logging.info("Fermeture complète de l'application demandée depuis l'interface")
            
            # Utiliser la fonction spéciale pour fermeture depuis GUI
            import main
            main.quit_from_gui()

    def _on_history_double_click(self, event):
        """Copie automatiquement l'élément sur lequel on double-clique."""
        self._copy_history_selection()

    def _on_history_right_click(self, event):
        """Affiche le menu contextuel au clic droit."""
        # Sélectionner l'élément sous le curseur
        # Sélection pour Treeview
        try:
            row = self.history_tree.identify_row(event.y)
            if row:
                self.history_tree.selection_set(row)
                self.history_tree.focus(row)
        except Exception:
            pass
            
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

    def _clear_all_history(self):
        """Supprime tout l'historique après confirmation."""
        import tkinter.messagebox as msgbox
        if msgbox.askyesno("Confirmation", "Êtes-vous sûr de vouloir supprimer tout l'historique des transcriptions ?\n\nCette action est irréversible.", parent=self.main_window if hasattr(self, 'main_window') else self.root):
            try:
                import main
                # Effacer via la fonction main (protégée par verrou)
                main.clear_all_transcription_history()
                # Effacer également les fichiers audio associés
                try:
                    from voice_tool.paths import RECORDINGS_DIR
                    import os
                    count = 0
                    if os.path.isdir(RECORDINGS_DIR):
                        for name in os.listdir(RECORDINGS_DIR):
                            if name.lower().endswith('.wav'):
                                full = os.path.join(RECORDINGS_DIR, name)
                                try:
                                    os.remove(full)
                                    count += 1
                                except Exception as e:
                                    logging.error(f"Suppression audio échouée: {e}")
                    logging.info(f"Tous les enregistrements audio supprimés ({count})")
                except Exception as e:
                    logging.error(f"Nettoyage des enregistrements échoué: {e}")
                # Effacer la listbox dans l'interface
                if self.history_listbox:
                    self.history_listbox.delete(0, tk.END)
                    # Nettoyer aussi les données associées
                    if hasattr(self.history_listbox, 'text_data'):
                        self.history_listbox.text_data = {}
                # Nettoyer les structures locales
                self._history_master = []
                self._filtered_history_items = []
                # Vider les vues modernes (table/cartes) et re-render
                try:
                    if hasattr(self, 'history_tree') and self.history_tree:
                        for iid in self.history_tree.get_children():
                            self.history_tree.delete(iid)
                        self._tree_id_to_obj = {}
                except Exception:
                    pass
                try:
                    self._clear_history_cards()
                except Exception:
                    pass
                try:
                    # Utiliser le pipeline existant pour mettre à jour compteur + label vide
                    self._apply_history_filter()
                except Exception:
                    pass
                logging.info("Tout l'historique a été effacé.")
                msgbox.showinfo("Succès", "L'historique a été complètement effacé.", parent=self.main_window if hasattr(self, 'main_window') else self.root)
            except Exception as e:
                logging.error(f"Erreur lors de la suppression de l'historique: {e}")
                msgbox.showerror("Erreur", "Une erreur est survenue lors de la suppression de l'historique.", parent=self.main_window if hasattr(self, 'main_window') else self.root)

    def _export_history(self):
        """Ouvre une fenêtre de dialogue pour choisir le format d'export."""
        import tkinter.messagebox as msgbox
        import tkinter.filedialog as filedialog
        import main
        import csv
        import json
        from datetime import datetime
        
        # Recharger l'historique depuis le fichier pour être sûr d'avoir la version la plus récente
        current_history = main.load_transcription_history()
        
        if not current_history:
            msgbox.showwarning("Attention", "Aucune transcription à exporter.", parent=self.main_window if hasattr(self, 'main_window') else self.root)
            return
        
        # Demander le format d'export
        export_window = ctk.CTkToplevel(self.root)
        self._export_window = export_window  # garder une référence forte pour éviter une fermeture immédiate par GC
        export_window.title("Exporter l'historique")
        export_window.geometry("300x220")
        try:
            export_window.configure(fg_color="#2b2b2b")
        except Exception:
            pass
        export_window.resizable(False, False)
        # Rendre la fenêtre modale et centrée par rapport à la fenêtre principale
        try:
            parent_win = self.main_window if hasattr(self, 'main_window') and self.main_window else self.root
            export_window.transient(parent_win)
            export_window.grab_set()
        except Exception:
            pass
        
        # Centrer la fenêtre
        export_window.update_idletasks()
        x = export_window.winfo_screenwidth() // 2 - export_window.winfo_width() // 2
        y = export_window.winfo_screenheight() // 2 - export_window.winfo_height() // 2
        export_window.geometry(f"+{x}+{y}")
        
        ctk.CTkLabel(export_window, text="Choisissez le format d'export :", font=("Arial", 12, "bold")).pack(pady=(15, 10))
        try:
            export_window.focus_force()
        except Exception:
            pass
        
        def export_csv():
            filename = filedialog.asksaveasfilename(
                defaultextension=".csv",
                filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
                title="Sauvegarder en CSV",
                parent=self.main_window if hasattr(self, 'main_window') else self.root
            )
            if filename:
                try:
                    with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
                        writer = csv.writer(csvfile)
                        writer.writerow(['Timestamp', 'Texte'])
                        for item in current_history:
                            if isinstance(item, dict):
                                writer.writerow([item['timestamp'], item['text']])
                            else:
                                writer.writerow([datetime.now().strftime('%Y-%m-%d %H:%M:%S'), str(item)])
                    msgbox.showinfo("Succès", f"Historique exporté vers {filename}", parent=self.main_window if hasattr(self, 'main_window') else self.root)
                except Exception as e:
                    msgbox.showerror("Erreur", f"Erreur lors de l'export CSV: {e}", parent=self.main_window if hasattr(self, 'main_window') else self.root)
                finally:
                    self._close_export_window()
        
        def export_txt():
            filename = filedialog.asksaveasfilename(
                defaultextension=".txt",
                filetypes=[("Text files", "*.txt"), ("All files", "*.*")],
                title="Sauvegarder en TXT",
                parent=self.main_window if hasattr(self, 'main_window') else self.root
            )
            if filename:
                try:
                    with open(filename, 'w', encoding='utf-8') as txtfile:
                        txtfile.write(f"=== HISTORIQUE VOICE TOOL - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ===\n\n")
                        for i, item in enumerate(current_history, 1):
                            if isinstance(item, dict):
                                txtfile.write(f"{i}. [{item['timestamp']}]\n{item['text']}\n\n")
                            else:
                                txtfile.write(f"{i}. {str(item)}\n\n")
                    msgbox.showinfo("Succès", f"Historique exporté vers {filename}", parent=self.main_window if hasattr(self, 'main_window') else self.root)
                except Exception as e:
                    msgbox.showerror("Erreur", f"Erreur lors de l'export TXT: {e}", parent=self.main_window if hasattr(self, 'main_window') else self.root)
                finally:
                    self._close_export_window()
        
        def export_json():
            filename = filedialog.asksaveasfilename(
                defaultextension=".json",
                filetypes=[("JSON files", "*.json"), ("All files", "*.*")],
                title="Sauvegarder en JSON",
                parent=self.main_window if hasattr(self, 'main_window') else self.root
            )
            if filename:
                try:
                    export_data = {
                        'version': '1.0',
                        'exported': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        'count': len(current_history),
                        'transcriptions': current_history
                    }
                    with open(filename, 'w', encoding='utf-8') as jsonfile:
                        json.dump(export_data, jsonfile, ensure_ascii=False, indent=2)
                    msgbox.showinfo("Succès", f"Historique exporté vers {filename}", parent=self.main_window if hasattr(self, 'main_window') else self.root)
                except Exception as e:
                    msgbox.showerror("Erreur", f"Erreur lors de l'export JSON: {e}", parent=self.main_window if hasattr(self, 'main_window') else self.root)
                finally:
                    self._close_export_window()
        
        # Boutons d'export
        btn_frame = ctk.CTkFrame(export_window)
        btn_frame.pack(pady=10)
        
        ctk.CTkButton(btn_frame, text="📊  CSV", command=export_csv, fg_color="#28a745", text_color="white", font=("Arial", 10), width=160, height=28).pack(pady=5)
        ctk.CTkButton(btn_frame, text="📄  TXT", command=export_txt, fg_color="#6f42c1", text_color="white", font=("Arial", 10), width=160, height=28).pack(pady=5)
        ctk.CTkButton(btn_frame, text="🔧  JSON", command=export_json, fg_color="#fd7e14", text_color="white", font=("Arial", 10), width=160, height=28).pack(pady=5)
        
        ctk.CTkButton(export_window, text="Annuler", command=self._close_export_window, fg_color="#6c757d", text_color="white", font=("Arial", 10), width=160, height=28).pack(pady=10)
        try:
            export_window.protocol("WM_DELETE_WINDOW", self._close_export_window)
        except Exception:
            pass

    def _close_export_window(self):
        try:
            if hasattr(self, '_export_window') and self._export_window and self._export_window.winfo_exists():
                try:
                    self._export_window.grab_release()
                except Exception:
                    pass
                self._export_window.destroy()
        except Exception:
            pass
        finally:
            self._export_window = None

    def _import_history(self):
        """Importe un historique depuis un fichier JSON."""
        import tkinter.messagebox as msgbox
        import tkinter.filedialog as filedialog
        import main
        import json
        
        filename = filedialog.askopenfilename(
            filetypes=[("JSON files", "*.json"), ("All files", "*.*忽视")],
            title="Importer un historique JSON",
            parent=self.main_window if hasattr(self, 'main_window') else self.root
        )
        
        if not filename:
            return
        
        try:
            with open(filename, 'r', encoding='utf-8') as jsonfile:
                data = json.load(jsonfile)
            
            # Vérifier la structure
            if isinstance(data, dict) and 'transcriptions' in data:
                imported_transcriptions = data['transcriptions']
            elif isinstance(data, list):
                imported_transcriptions = data
            else:
                raise ValueError("Format de fichier non supporté")
            
            # Demander confirmation pour le merge ou remplacement
            if main.transcription_history:
                result = msgbox.askyesnocancel("Import",
                    f"Importer {len(imported_transcriptions)} transcriptions.\n\n" +
                    "Oui = Ajouter à l'historique existant\n" +
                    "Non = Remplacer l'historique existant\n" +
                    "Annuler = Annuler l'import",
                    parent=self.main_window if hasattr(self, 'main_window') else self.root)
                
                if result is None:  # Annuler
                    return
                elif result:  # Oui - Ajouter
                    main.transcription_history.extend(imported_transcriptions)
                else:  # Non - Remplacer
                    main.transcription_history = imported_transcriptions
            else:
                main.transcription_history = imported_transcriptions
            
            # Sauvegarder et rafraîchir l'interface
            main.save_transcription_history(main.transcription_history)
            self._refresh_history_display()
            
            msgbox.showinfo("Succès", f"{len(imported_transcriptions)} transcriptions importées avec succès !", parent=self.main_window if hasattr(self, 'main_window') else self.root)
            
        except Exception as e:
            msgbox.showerror("Erreur", f"Erreur lors de l'import: {e}", parent=self.main_window if hasattr(self, 'main_window') else self.root)

    def _refresh_history_display(self):
        """Rafraîchit l'affichage de l'historique après import/suppression."""
        import main
        try:
            # Mettre à jour la liste maître depuis la source et re-filtrer (indépendant du widget utilisé)
            self._history_master = list(main.transcription_history or [])
        except Exception:
            self._history_master = []
        # Utiliser le pipeline unifié qui gère table/cartes + compteur + label vide
        self._apply_history_filter()


    def create_main_interface_window(self, history=None, current_config=None, save_callback=None):
        """Crée et affiche l'interface principale avec onglets (Historique/Logs, Paramètres)."""
        # Importer ici pour s'assurer d'avoir l'état le plus récent
        import main
        # Recharger les user_settings pour être sûr d'avoir la version la plus récente
        user_settings = main.load_user_settings()
        # Vérifie si la fenêtre n'est pas déjà ouverte pour éviter les doublons
        if self.main_window and self.main_window.winfo_exists():
            # Lors d'une ouverture explicite, on donne toujours le focus à la fenêtre
            self.main_window.lift()
            try:
                self.main_window.focus_force()
            except Exception:
                pass
            return

        # Utiliser CTkToplevel pour éviter une fenêtre Tk par défaut intitulée "tk"
        self.main_window = ctk.CTkToplevel(self.root)
        self.main_window.title("Voice Tool")
        # Appliquer l'état/geometry persistés si disponibles (ordre: état puis géométrie si normal)
        try:
            import main
            us = main.load_user_settings()
            saved_geom = us.get("main_window_geometry")
            saved_state = us.get("main_window_state", "zoomed")
            if saved_state == 'zoomed':
                try:
                    self.main_window.state('zoomed')
                except Exception:
                    try:
                        self.main_window.attributes('-zoomed', True)
                    except Exception:
                        pass
            else:
                try:
                    self.main_window.state('normal')
                except Exception:
                    pass
                if isinstance(saved_geom, str) and len(saved_geom) >= 6:
                    try:
                        self.main_window.geometry(saved_geom)
                    except Exception:
                        pass
            # Confirmer la géométrie appliquée
            try:
                self.main_window.update_idletasks()
            except Exception:
                pass
        except Exception:
            # Fallback: plein écran Windows sinon géométrie confortable
            try:
                self.main_window.state('zoomed')
            except Exception:
                try:
                    self.main_window.attributes('-zoomed', True)
                except Exception:
                    self.main_window.geometry("1200x800")
        
        # Définir l'icône personnalisée
        self.set_window_icon(self.main_window)
        
        # Centrage seulement si aucune géométrie n'était fournie et pas zoomed
        self.main_window.update_idletasks()
        try:
            import main
            us = main.load_user_settings()
            had_geom = bool(us.get("main_window_geometry"))
        except Exception:
            had_geom = False
        try:
            if self.main_window.state() != 'zoomed' and not had_geom:
                x = self.root.winfo_screenwidth() // 2 - self.main_window.winfo_width() // 2
                y = self.root.winfo_screenheight() // 2 - self.main_window.winfo_height() // 2
                self.main_window.geometry(f"+{x}+{y}")
        except Exception:
            pass
        self.main_window.configure(bg="#2b2b2b")

        # Détection des mouvements/redimensionnements avec sauvegarde différée
        self._geom_save_after_id = None
        self._last_saved_geometry = None
        self._last_saved_state = None
        self._last_configure_ts = 0.0
        # Optimisation cartes pendant redimensionnement
        self._cards_resize_after_id = None
        self._cards_hidden_for_resize = False
        self._cards_placeholder = None

        def _save_geometry_now():
            try:
                import main
                state = None
                geom = None
                try:
                    state = self.main_window.state()
                except Exception:
                    state = None
                try:
                    geom = self.main_window.geometry()
                except Exception:
                    geom = None
                # Éviter les écritures inutiles
                if state == self._last_saved_state and ((state != 'normal') or (geom == self._last_saved_geometry)):
                    return
                if state:
                    main.user_settings.update({"main_window_state": state})
                # On ne persiste la géométrie que quand la fenêtre est en état normal
                if geom and state == 'normal':
                    main.user_settings.update({"main_window_geometry": geom})
                main.save_user_settings(main.user_settings)
                self._last_saved_state = state
                if state == 'normal':
                    self._last_saved_geometry = geom
            except Exception:
                pass

        def _schedule_geometry_save(event=None):
            try:
                # Ne traiter que les events issus de la fenêtre principale
                if event is not None and getattr(event, 'widget', None) is not self.main_window:
                    return
                # Debounce: ne pas recalculer trop souvent pendant le drag/resize
                import time as _t
                now = _t.monotonic()
                last = getattr(self, '_last_configure_ts', 0.0)
                if now - last < 0.05:  # max ~20Hz
                    return
                self._last_configure_ts = now
                # Redémarrer le timer de sauvegarde différée
                if self._geom_save_after_id is not None:
                    try:
                        self.root.after_cancel(self._geom_save_after_id)
                    except Exception:
                        pass
                self._geom_save_after_id = self.root.after(1500, _save_geometry_now)

                # Geler l'affichage des cartes pendant le redimensionnement (pour réduire le lag)
                try:
                    view_mode = self._history_view_mode.get() if hasattr(self, '_history_view_mode') else 'cartes'
                except Exception:
                    view_mode = 'cartes'
                if view_mode == 'cartes':
                    # Planifier la ré‑affichage après une courte inactivité (220ms)
                    if self._cards_resize_after_id is not None:
                        try:
                            self.root.after_cancel(self._cards_resize_after_id)
                        except Exception:
                            pass
                    # Masquer immédiatement les cartes si pas déjà fait
                    if not self._cards_hidden_for_resize:
                        try:
                            if hasattr(self, 'history_cards_container') and self.history_cards_container.winfo_ismapped():
                                self.history_cards_container.pack_forget()
                                self._cards_hidden_for_resize = True
                                # Afficher un placeholder discret
                                try:
                                    ph = ctk.CTkLabel(self._history_tab if hasattr(self, '_history_tab') else self.main_window,
                                                       text="Redimensionnement…",
                                                       text_color="#888888",
                                                       font=("Arial", 11))
                                    ph.pack(pady=12)
                                    self._cards_placeholder = ph
                                except Exception:
                                    self._cards_placeholder = None
                        except Exception:
                            pass
                    # Reprogrammer l'affichage des cartes après pause
                    def _end_cards_resize():
                        try:
                            if self._cards_placeholder and self._cards_placeholder.winfo_exists():
                                try:
                                    self._cards_placeholder.destroy()
                                except Exception:
                                    pass
                                self._cards_placeholder = None
                            if hasattr(self, 'history_cards_container') and not self.history_cards_container.winfo_ismapped():
                                self.history_cards_container.pack(fill=tk.BOTH, expand=True)
                            self._cards_hidden_for_resize = False
                        except Exception:
                            pass
                        finally:
                            self._cards_resize_after_id = None
                    self._cards_resize_after_id = self.root.after(220, _end_cards_resize)
            except Exception:
                pass

        try:
            self.main_window.bind('<Configure>', _schedule_geometry_save)
        except Exception:
            pass

        # Style du notebook (onglets du haut)
        nb_style = ttk.Style(self.root)
        try:
            nb_style.theme_use('clam')
        except Exception:
            pass
        nb_style.configure("VT.TNotebook", background="#2b2b2b", borderwidth=0, tabmargins=(4, 4, 4, 0))
        nb_style.configure(
            "VT.TNotebook.Tab",
            background="#1f1f1f",
            foreground="white",
            padding=(20, 12),  # base padding pour les onglets non sélectionnés
            font=("Arial", 11, "bold")
        )
        nb_style.map(
            "VT.TNotebook.Tab",
            background=[('selected', '#0078d7'), ('active', '#3a3a3a')],
            foreground=[('selected', 'white')],
            relief=[('selected', 'flat'), ('!selected', 'flat')],
            # Augmenter légèrement taille perçue du tab sélectionné
            font=[('selected', ('Arial', 12, 'bold'))],
            # Augmenter padding vertical du tab sélectionné pour compenser l'effet visuel de hauteur
            padding=[('selected', (22, 16)), ('!selected', (20, 14))]
        )
        # Forcer un layout constant pour éviter les variations de hauteur entre états
        try:
            nb_style.layout(
                "VT.TNotebook.Tab",
                [
                    ("Notebook.tab", {
                        "sticky": "nswe",
                        "children": [
                            ("Notebook.padding", {
                                "side": "top",
                                "sticky": "nswe",
                                "children": [
                                    ("Notebook.focus", {
                                        "side": "top",
                                        "sticky": "nswe",
                                        "children": [
                                            ("Notebook.label", {"side": "top", "sticky": ""})
                                        ]
                                    })
                                ]
                            })
                        ]
                    })
                ]
            )
        except Exception:
            pass

        # --- Création des onglets ---
        notebook = ttk.Notebook(self.main_window, style="VT.TNotebook")
        notebook.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        # Référencer le notebook pour navigation programmée
        self._main_notebook = notebook

        # --- Onglet 1: Historique ---
        history_tab = ctk.CTkFrame(notebook, fg_color="#2b2b2b")
        notebook.add(history_tab, text='  Historique  ')
        self._history_tab = history_tab
        history_frame = ctk.CTkFrame(history_tab, fg_color="#2b2b2b"); history_frame.pack(fill=tk.BOTH, expand=True)
        
        # En-tête avec titre, compteur et bascule d'affichage
        header = ctk.CTkFrame(history_frame, fg_color="#2b2b2b")
        header.pack(fill=tk.X, pady=(6, 4), padx=5)
        ctk.CTkLabel(header, text="Historique des transcriptions", text_color="white", font=("Arial", 13, "bold")).pack(side=tk.LEFT)
        self.history_count_label = ctk.CTkLabel(header, text="", text_color="#aaaaaa", font=("Arial", 10))
        self.history_count_label.pack(side=tk.LEFT, padx=(8,0))
        
        # Bascule entre Vue Table et Vue Cartes (par défaut: Cartes)
        self._history_view_mode = tk.StringVar(master=self.root, value="cartes")
        def _on_view_change(choice):
            try:
                self._switch_history_view(choice)
                # Re-rendu pour appliquer le mode
                self._render_history_list(self._filtered_history_items or self._history_master)
            except Exception:
                pass
        view_toggle = ctk.CTkSegmentedButton(header, values=["table", "cartes"], variable=self._history_view_mode, command=_on_view_change)
        view_toggle.pack(side=tk.RIGHT)
        view_toggle.set("cartes")

        # Barre de recherche
        search_frame = ctk.CTkFrame(history_frame, fg_color="#2b2b2b")
        search_frame.pack(fill=tk.X, padx=5, pady=(0, 10))
        ctk.CTkLabel(search_frame, text="Rechercher:", text_color="white").pack(side=tk.LEFT, padx=(0, 8))
        search_entry = ctk.CTkEntry(search_frame, textvariable=self.history_search_var, placeholder_text="Rechercher…", corner_radius=12)
        search_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        clear_btn = ctk.CTkButton(search_frame, text="Effacer", command=lambda: self._clear_search(), font=("Arial", 11))
        clear_btn.pack(side=tk.LEFT, padx=(8, 0))
        # Style moderne pour Treeview
        style = ttk.Style(self.root)
        try:
            style.theme_use('clam')
        except Exception:
            pass
        style.configure("VT.Treeview",
                        background="#2f2f2f",
                        fieldbackground="#2f2f2f",
                        foreground="white",
                        rowheight=24,
                        borderwidth=0)
        style.map("VT.Treeview",
                  background=[('selected', '#0078d7')],
                  foreground=[('selected', 'white')])
        style.configure("VT.Treeview.Heading",
                        background="#1f1f1f",
                        foreground="white",
                        relief=tk.FLAT)

        # Zone de contenu (pile) : table vs cartes
        content_stack = ctk.CTkFrame(history_frame, fg_color="#2b2b2b")
        content_stack.pack(fill=tk.BOTH, expand=True, padx=5)
        
        # Vue Table: léger cadre
        self.history_table_frame = ctk.CTkFrame(content_stack, fg_color="#2b2b2b", border_color="#3c3c3c", border_width=1, corner_radius=8)
        self.history_table_frame.pack_forget() # default to cards view
        yscroll = tk.Scrollbar(self.history_table_frame)
        yscroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.history_tree = ttk.Treeview(self.history_table_frame,
                                         columns=("time", "text"),
                                         show="headings",
                                         yscrollcommand=yscroll.set,
                                         style="VT.Treeview")
        self.history_tree.heading("time", text="Date/Heure")
        self.history_tree.heading("text", text="Texte")
        # Colonne date/heure légèrement plus large pour créer un espace visuel
        self.history_tree.column("time", width=140, minwidth=110, anchor=tk.W, stretch=False)
        # Colonne texte occupe l'espace restant
        self.history_tree.column("text", width=400, minwidth=200, anchor=tk.W, stretch=True)

        # Tags pour zébrage des lignes
        try:
            self.history_tree.tag_configure('oddrow', background='#2a2a2a')
            self.history_tree.tag_configure('evenrow', background='#2f2f2f')
        except Exception:
            pass
        self.history_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        yscroll.config(command=self.history_tree.yview)
        
        # Vue Cartes: scrollable
        self.history_cards_container = ctk.CTkScrollableFrame(content_stack, fg_color="#2b2b2b", corner_radius=8)
        # Optimisations d'UI pour réduire le coût de layout pendant resize
        try:
            self.history_cards_container.grid_propagate(False)
        except Exception:
            pass
        # Par défaut, afficher les cartes et masquer la table
        self.history_table_frame.pack_forget()
        self.history_cards_container.pack(fill=tk.BOTH, expand=True)
        
        # Événements pour l'historique
        self.history_tree.bind("<Double-Button-1>", self._on_history_double_click)
        self.history_tree.bind("<Button-3>", self._on_history_right_click)  # Clic droit
        # Charger l'historique dans la liste maître et rendre la vue (filtrée)
        self._history_master = list(history) if history else []
        self._apply_history_filter()
        # Démarrer le watcher de fichier histoire (polling léger)
        try:
            self._start_history_file_watch()
        except Exception:
            pass

        # Déclencher le filtrage à la saisie (avec debounce)
        try:
            self.history_search_var.trace_add("write", lambda *_: self._on_search_changed())
        except Exception:
            pass
        # État "aucun résultat"
        self.history_empty_label = ctk.CTkLabel(history_frame, text="Aucun résultat", text_color="#888888", font=("Arial", 10))
        
        # Indication pour les interactions avec l'historique
        help_frame = ctk.CTkFrame(history_frame, fg_color="#2b2b2b")
        help_frame.pack(pady=(10,5), padx=5, fill=tk.X)
        
        ctk.CTkLabel(help_frame, text="💡 Double-clic pour copier • Clic droit pour le menu", 
                text_color="#888888", font=("Arial", 11), justify=tk.LEFT).pack(side=tk.LEFT)

        # Boutons d'action
        buttons_frame = ctk.CTkFrame(help_frame, fg_color="#2b2b2b")
        buttons_frame.pack(side=tk.RIGHT)
        
        # Bouton d'import
        ctk.CTkButton(buttons_frame, text="📥 Import", 
                  command=self._import_history, 
                  fg_color="#28a745",
                  text_color="white",
                  height=32,
                  corner_radius=8,
                  font=("Arial", 11, "bold")).pack(side=tk.LEFT, padx=(0, 5))
        
        # Bouton d'export
        ctk.CTkButton(buttons_frame, text="📤 Export", 
                  command=self._export_history, 
                  fg_color="#007bff",
                  text_color="white",
                  height=32,
                  corner_radius=8,
                  font=("Arial", 11, "bold")).pack(side=tk.LEFT, padx=(0, 5))
        
        # Bouton pour tout effacer
        ctk.CTkButton(buttons_frame, text="🗑️ Tout effacer", 
                  command=self._clear_all_history, 
                  fg_color="#dc3545",
                  text_color="white",
                  height=32,
                  corner_radius=8,
                  font=("Arial", 11, "bold")).pack(side=tk.LEFT)
        
        # Avertissement si auto-paste actif
        try:
            import main
            if main.get_setting('paste_at_cursor', False):
                warn = ctk.CTkLabel(history_frame, text="Astuce: l'option 'Insérer automatiquement au curseur' est active. Évitez de donner le focus à cette fenêtre si vous ne voulez pas y coller.", text_color="#ffc107", font=("Arial", 10))
                warn.pack(pady=(8,0), padx=5, anchor='w')
        except Exception:
            pass
        
        # Message informatif pour le raccourci d'enregistrement
        shortcut_frame = ctk.CTkFrame(history_frame, fg_color="#1e1e1e")
        shortcut_frame.pack(pady=(10,10), padx=5, fill=tk.X)
        
        ctk.CTkLabel(shortcut_frame, text="🎤", text_color="#FF6B6B", font=("Arial", 16)).pack(pady=(8,2))
        ctk.CTkLabel(shortcut_frame, text="Pour démarrer/arrêter l'enregistrement", text_color="white", font=("Arial", 10)).pack()
        
        # Afficher le raccourci configuré (prend en compte le mode)
        try:
            import main
            us = main.load_user_settings()
            mode_label = us.get("record_mode", "toggle")
            if mode_label == "ptt":
                shortcut_text = f"Maintenir {us.get('ptt_hotkey', '<ctrl>+<shift>+<space>')}"
            else:
                shortcut_text = f"Appuyez sur {us.get('record_hotkey', '<ctrl>+<alt>+s')}"
        except Exception:
            shortcut_text = "Appuyez sur <ctrl>+<alt>+s"
        shortcut_label = ctk.CTkLabel(shortcut_frame, text=shortcut_text, text_color="#4ECDC4", font=("Arial", 11, "bold"))
        shortcut_label.pack(pady=(2,8))
        # Fin Onglet Historique

        # --- Onglet 2: Paramètres ---
        # Créer un onglet conteneur, puis un frame scrollable pour le contenu
        settings_tab = ctk.CTkFrame(notebook, fg_color="#2b2b2b")
        notebook.add(settings_tab, text='  Paramètres  ')
        self._settings_tab = settings_tab
        settings_frame = ctk.CTkScrollableFrame(settings_tab, fg_color="#2b2b2b")
        settings_frame.pack(fill=tk.BOTH, expand=True)
        
        # Définir les variables AVANT la fonction (lier explicitement au root Tk)
        sounds_var = tk.BooleanVar(master=self.root)
        paste_var = tk.BooleanVar(master=self.root)
        auto_start_var = tk.BooleanVar(master=self.root)
        smart_format_var = tk.BooleanVar(master=self.root)
        
        # Fonction pour gérer le démarrage automatique Windows
        def manage_auto_start(enable):
            """Active ou désactive le démarrage automatique avec Windows."""
            try:
                import os
                import shutil
                
                # Chemin vers le dossier de démarrage Windows
                startup_folder = os.path.join(os.getenv('APPDATA'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
                bat_file_name = "Voice Tool (Background).bat"
                startup_bat_path = os.path.join(startup_folder, bat_file_name)
                
                # Chemin vers le fichier .bat source (dans le dossier du projet)
                import main
                project_dir = os.path.dirname(os.path.abspath(main.__file__))
                source_bat_path = os.path.join(project_dir, bat_file_name)
                
                if enable:
                    # Activer le démarrage automatique
                    if os.path.exists(source_bat_path):
                        shutil.copy2(source_bat_path, startup_bat_path)
                        logging.info(f"Démarrage automatique activé: {startup_bat_path}")
                        return True
                    else:
                        logging.error(f"Fichier .bat source introuvable: {source_bat_path}")
                        return False
                else:
                    # Désactiver le démarrage automatique
                    if os.path.exists(startup_bat_path):
                        os.remove(startup_bat_path)
                        logging.info(f"Démarrage automatique désactivé: {startup_bat_path}")
                        return True
                    else:
                        logging.info("Démarrage automatique déjà désactivé")
                        return True
                        
            except Exception as e:
                logging.error(f"Erreur lors de la gestion du démarrage automatique: {e}")
                return False

        # Fonction pour sauvegarder automatiquement les paramètres utilisateur
        def auto_save_user_setting():
            """Sauvegarde automatique des paramètres utilisateur (paste_at_cursor, enable_sounds, auto_start)"""
            try:
                import main
                # Convertir les valeurs d'affichage en valeurs API
                display_provider = transcription_provider_var.get()
                api_provider = provider_display_to_api.get(display_provider, "Google")
                
                display_language = language_var.get()
                api_language = language_display_to_api.get(display_language, "fr-FR")
                
                user_config = {
                    "enable_sounds": sounds_var.get(),
                    "paste_at_cursor": paste_var.get(),
                    "auto_start": auto_start_var.get(),
                    "transcription_provider": api_provider,
                    "language": api_language,
                    "smart_formatting": smart_format_var.get(),
                    "record_mode": record_mode_var.get(),
                    # si PTT, on sauvegarde à chaque changement de mode
                    **({"ptt_hotkey": ptt_hotkey_entry.get().strip()} if 'ptt_hotkey_entry' in locals() and record_mode_var.get()=="ptt" else {}),
                }
                
                # Gérer le démarrage automatique si nécessaire
                if 'auto_start' in user_config:
                    manage_auto_start(user_config['auto_start'])
                
                # Mettre à jour la variable globale, sauvegarder ET recharger pour sync
                main.user_settings.update(user_config)
                main.save_user_settings(main.user_settings)
                # Recharger pour être sûr de la synchronisation entre threads
                main.user_settings = main.load_user_settings()
                logging.info(f"Paramètres sauvegardés et rechargés: {user_config}")
            except Exception as e:
                logging.error(f"Erreur auto-save: {e}")

        # === Helpers UI ===
        def create_card(parent, title_text):
            card = ctk.CTkFrame(parent, fg_color="#1f1f1f", corner_radius=8)
            header = ctk.CTkLabel(card, text=title_text, text_color="white", font=("Arial", 12, "bold"))
            header.pack(anchor='w', padx=12, pady=(10, 6))
            body = ctk.CTkFrame(card, fg_color="#1f1f1f")
            body.pack(fill=tk.BOTH, expand=True, padx=12, pady=(0, 12))
            return card, body

        # === LAYOUT 2x2 POUR LES SECTIONS ===
        two_cols = ctk.CTkFrame(settings_frame, fg_color="#2b2b2b")
        two_cols.pack(fill=tk.X, padx=16, pady=16)
        left_col = ctk.CTkFrame(two_cols, fg_color="#2b2b2b")
        left_col.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 8))
        right_col = ctk.CTkFrame(two_cols, fg_color="#2b2b2b")
        right_col.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(8, 0))
        
        # === SECTION AUDIO (à gauche) ===
        audio_card, audio_frame = create_card(left_col, "🔊 Audio")
        audio_card.pack(fill=tk.BOTH, expand=True, pady=(0, 16))
        
        # Charger depuis les paramètres utilisateur passés en paramètre
        if user_settings and "enable_sounds" in user_settings:
            sounds_var.set(user_settings["enable_sounds"])
        elif current_config:
            sounds_var.set(current_config.get("enable_sounds", True))
        else:
            sounds_var.set(True)
        sounds_check = ctk.CTkCheckBox(audio_frame, text="Activer les sons d'interface",
                                       variable=sounds_var, command=auto_save_user_setting)
        sounds_check.pack(anchor='w', pady=(0, 15))

        # Option: Activer l'écoute des audios dans l'historique
        history_preview_var = tk.BooleanVar(master=self.root)
        try:
            history_preview_var.set(user_settings.get("enable_history_audio_preview", True))
        except Exception:
            history_preview_var.set(True)

        def _save_history_preview():
            try:
                import main
                main.update_and_restart_hotkeys({})  # no-op pour rester cohérent
                main.user_settings.update({"enable_history_audio_preview": history_preview_var.get()})
                main.save_user_settings(main.user_settings)
            except Exception as e:
                logging.error(f"Sauvegarde enable_history_audio_preview échouée: {e}")

        history_preview_check = ctk.CTkCheckBox(
            audio_frame,
            text="Afficher le bouton Écouter dans l'historique",
            variable=history_preview_var,
            command=_save_history_preview,
        )
        history_preview_check.pack(anchor='w', pady=(0, 12))

        # Liste des périphériques audio d'entrée
        devices = []
        try:
            sd_devices = sd.query_devices()
            for idx, dev in enumerate(sd_devices):
                if dev.get('max_input_channels', 0) > 0:
                    name = dev.get('name', f"Device {idx}")
                    host = dev.get('hostapi', None)
                    label = f"[{idx}] {name}" if host is None else f"[{idx}] {name}"
                    devices.append((idx, label))
            # Ajouter l'option Par défaut (Windows)
            default_label = "Par défaut (Windows)"
            try:
                default_dev = sd.default.device
                default_in = None
                if isinstance(default_dev, (list, tuple)) and len(default_dev) > 0:
                    default_in = default_dev[0]
                elif isinstance(default_dev, int):
                    default_in = default_dev
                if default_in is not None and isinstance(default_in, int) and 0 <= default_in < len(sd_devices):
                    def_name = sd_devices[default_in].get('name', f"Device {default_in}")
                    default_label = f"Par défaut (Windows): [{default_in}] {def_name}"
            except Exception:
                pass
            devices.insert(0, (None, default_label))
        except Exception as e:
            logging.error(f"Erreur lors de l'énumération des périphériques: {e}")
            devices = []

        ctk.CTkLabel(audio_frame, text="Microphone d'entrée :", text_color="white").pack(anchor='w', pady=(0,2))
        mic_var = tk.StringVar(master=self.root)
        # Valeur par défaut depuis user_settings
        default_input_index = None
        try:
            default_input_index = user_settings.get("input_device_index", None) if user_settings else None
        except Exception:
            default_input_index = None

        # Construire la liste visible
        mic_choices = [label for _, label in devices]
        if not mic_choices:
            mic_choices = ["(aucun périphérique d'entrée disponible)"]

        # Déterminer la sélection initiale
        initial_choice = None
        if default_input_index is not None:
            for idx, label in devices:
                if idx == default_input_index:
                    initial_choice = label
                    break
        if initial_choice is None and mic_choices:
            initial_choice = mic_choices[0]
        mic_var.set(initial_choice)

        def on_mic_changed(*_):
            # Mapper le label sélectionné vers l'index
            selected_label = mic_var.get()
            selected_index = None
            for idx, label in devices:
                if label == selected_label:
                    selected_index = idx
                    break
            # Sauvegarder dans les préférences
            try:
                import main
                main.update_and_restart_hotkeys({"input_device_index": selected_index})
                # Aussi persister via auto-save utilisateur
                main.user_settings.update({"input_device_index": selected_index})
                main.save_user_settings(main.user_settings)
                logging.info(f"Périphérique d'entrée sélectionné: {selected_label} -> index {selected_index}")
            except Exception as e:
                logging.error(f"Erreur sauvegarde périphérique: {e}")

        mic_menu = ctk.CTkOptionMenu(audio_frame, values=mic_choices, variable=mic_var, command=lambda *_: on_mic_changed())
        if initial_choice:
            mic_menu.set(initial_choice)
        mic_menu.pack(anchor='w', padx=(0, 20), pady=(0, 10))

        # === SECTION TEXTE (à gauche, sous Audio) ===
        text_card, text_frame = create_card(left_col, "📝 Texte")
        text_card.pack(fill=tk.BOTH, expand=True)
        
        # Charger depuis les paramètres utilisateur passés en paramètre
        if user_settings and "paste_at_cursor" in user_settings:
            paste_var.set(user_settings["paste_at_cursor"])
        elif current_config:
            paste_var.set(current_config.get("paste_at_cursor", False))
        else:
            paste_var.set(False)
            
        # Charger le paramètre auto_start
        if user_settings and "auto_start" in user_settings:
            auto_start_var.set(user_settings["auto_start"])
        else:
            auto_start_var.set(False)
        paste_check = ctk.CTkCheckBox(text_frame, text="Insérer automatiquement au curseur\naprès la transcription / copie depuis l'historique",
                                      variable=paste_var, command=auto_save_user_setting)
        paste_check.pack(anchor='w', pady=(0, 15))
        
        # Toggle Formatage intelligent
        try:
            if user_settings and "smart_formatting" in user_settings:
                smart_format_var.set(user_settings["smart_formatting"])
            else:
                smart_format_var.set(True)
        except Exception:
            smart_format_var.set(True)
        smart_format_check = ctk.CTkCheckBox(
            text_frame,
            text="Activer le formatage intelligent (ponctuation, majuscule, espaces)",
            variable=smart_format_var,
            command=auto_save_user_setting,
        )
        smart_format_check.pack(anchor='w', pady=(0, 15))
        
        # === SECTION TRANSCRIPTION (à droite, en haut) ===
        transcription_card, transcription_frame = create_card(right_col, "🤖 Service de Transcription")
        transcription_card.pack(fill=tk.BOTH, expand=True, pady=(0, 16))

        # Mapping entre affichage UI et valeurs API pour providers
        provider_display_to_api = {
            "Google": "Google",
            "OpenAI Whisper (recommandé)": "OpenAI"
        }
        provider_api_to_display = {v: k for k, v in provider_display_to_api.items()}

        # Mapping entre affichage UI et valeurs API pour langues
        language_display_to_api = {
            "🇫🇷 Français": "fr-FR",
            "🇺🇸 English": "en-US",
            "🇪🇸 Español": "es-ES",
            "🇩🇪 Deutsch": "de-DE",
            "🇮🇹 Italiano": "it-IT",
            "🇵🇹 Português": "pt-PT",
            "🇳🇱 Nederlands": "nl-NL"
        }
        language_api_to_display = {v: k for k, v in language_display_to_api.items()}

        transcription_provider_var = tk.StringVar(master=self.root)
        language_var = tk.StringVar(master=self.root)

        # Charger la configuration du fournisseur et convertir pour l'affichage
        current_api_provider = user_settings.get("transcription_provider", "Google") if user_settings and "transcription_provider" in user_settings else "Google"
        current_display_provider = provider_api_to_display.get(current_api_provider, "Google")
        transcription_provider_var.set(current_display_provider)

        # Charger la configuration de langue et convertir pour l'affichage
        current_api_language = user_settings.get("language", "fr-FR") if user_settings and "language" in user_settings else "fr-FR"
        current_display_language = language_api_to_display.get(current_api_language, "🇫🇷 Français")
        language_var.set(current_display_language)

        # Créer le menu déroulant pour le fournisseur
        ctk.CTkLabel(transcription_frame, text="Fournisseur de service :", text_color="white").pack(anchor='w', pady=(0,2))
        provider_menu = ctk.CTkOptionMenu(transcription_frame, values=["Google", "OpenAI Whisper (recommandé)"],
                                          variable=transcription_provider_var,
                                          command=lambda *_: auto_save_user_setting())
        provider_menu.set(current_display_provider)
        provider_menu.pack(anchor='w', padx=(0, 20), pady=(0, 10))

        # Créer le menu déroulant pour la langue
        ctk.CTkLabel(transcription_frame, text="Langue de transcription :", text_color="white").pack(anchor='w', pady=(0,2))
        language_values = ["🇫🇷 Français", "🇺🇸 English", "🇪🇸 Español", "🇩🇪 Deutsch", "🇮🇹 Italiano", "🇵🇹 Português", "🇳🇱 Nederlands"]
        language_menu = ctk.CTkOptionMenu(transcription_frame, values=language_values,
                                          variable=language_var,
                                          command=lambda *_: auto_save_user_setting())
        language_menu.set(current_display_language)
        language_menu.pack(anchor='w', padx=(0, 20), pady=(0, 10))

        # Traces supprimées pour éviter les doublons de sauvegarde; CTkOptionMenu appelle déjà auto_save_user_setting via command
        
        # === SECTION SYSTÈME (à droite, sous Transcription) ===
        system_card, system_frame = create_card(right_col, "💻 Système")
        system_card.pack(fill=tk.BOTH, expand=True)
        auto_start_check = ctk.CTkCheckBox(system_frame, text="Démarrer automatiquement avec Windows",
                                           variable=auto_start_var, command=auto_save_user_setting)
        auto_start_check.pack(anchor='w', pady=(0, 15))

        # Rétention enregistrements (garder N derniers)
        ctk.CTkLabel(system_frame, text="Conserver les N derniers enregistrements (WAV) :", text_color="white").pack(anchor='w')
        keep_last_var = tk.IntVar(master=self.root)
        try:
            import main
            keep_last_var.set(main.load_user_settings().get("recordings_keep_last", 25))
        except Exception:
            keep_last_var.set(25)
        # Contrôle CTk pour N derniers (remplace le Spinbox): bouton - / entrée / bouton +
        keep_row = ctk.CTkFrame(system_frame, fg_color="#1f1f1f")
        keep_row.pack(anchor='w', pady=(2, 10))
        def _inc_keep(delta):
            try:
                val = int(keep_last_var.get()) + delta
                val = max(0, min(1000, val))
                keep_last_var.set(val)
            except Exception:
                pass
        dec_btn = ctk.CTkButton(keep_row, text="-", width=28, command=lambda: _inc_keep(-1))
        dec_btn.pack(side=tk.LEFT, padx=(0,6))
        keep_entry = ctk.CTkEntry(keep_row, width=64, textvariable=keep_last_var)
        keep_entry.pack(side=tk.LEFT)
        inc_btn = ctk.CTkButton(keep_row, text="+", width=28, command=lambda: _inc_keep(1))
        inc_btn.pack(side=tk.LEFT, padx=(6,0))
        def on_keep_last_changed(*_):
            try:
                import main
                val = int(keep_last_var.get())
                main.update_and_restart_hotkeys({"recordings_keep_last": val})
            except Exception as e:
                logging.error(f"Sauvegarde recordings_keep_last échouée: {e}")
        keep_last_var.trace_add("write", lambda *_: on_keep_last_changed())
        
        # === SECTION RACCOURCIS ===
        shortcuts_card, shortcuts_frame = create_card(settings_frame, "⌨️ Raccourcis & modes d'enregistrement")
        shortcuts_card.pack(fill=tk.BOTH, expand=True, pady=(16, 0))
        
        # Mode d'enregistrement
        mode_row = ctk.CTkFrame(shortcuts_frame, fg_color="#1f1f1f")
        mode_row.pack(fill=tk.X, pady=(0, 12))
        ctk.CTkLabel(mode_row, text="Mode d'enregistrement :", text_color="white", font=("Arial", 12, "bold")).pack(anchor='w')
        record_mode_var = tk.StringVar(master=self.root, value=(user_settings.get("record_mode", "toggle") if user_settings else "toggle"))
        def on_mode_changed():
            auto_save_user_setting()
            # Afficher/masquer la ligne PTT selon le mode
            if record_mode_var.get() == "ptt":
                ptt_row.pack(fill=tk.X, pady=(0, 15))
            else:
                ptt_row.pack_forget()
            # Rafraîchir le label de raccourci après un court délai (le temps que la sauvegarde se propage)
            def refresh_shortcut_label():
                try:
                    import main
                    us = main.load_user_settings()
                    mode_label = us.get("record_mode", "toggle")
                    if mode_label == "ptt":
                        txt = f"Maintenir {us.get('ptt_hotkey', '<ctrl>+<shift>+<space>')}"
                    else:
                        txt = f"Appuyez sur {us.get('record_hotkey', '<ctrl>+<alt>+s')}"
                    if hasattr(self, '_shortcut_label') and self._shortcut_label:
                        self._shortcut_label.config(text=txt)
                except Exception:
                    pass
            self.root.after(120, refresh_shortcut_label)
        mode_toggle = ctk.CTkRadioButton(mode_row, text="Toggle (appuyer pour démarrer/arrêter)", value="toggle", variable=record_mode_var,
                                         command=on_mode_changed, font=("Arial", 11))
        mode_ptt = ctk.CTkRadioButton(mode_row, text="Push‑to‑talk (enregistrer tant que la touche est maintenue)", value="ptt", variable=record_mode_var,
                                       command=on_mode_changed, font=("Arial", 11))
        mode_toggle.pack(anchor='w')
        mode_ptt.pack(anchor='w')

        # Raccourci Enregistrement (toggle)
        ctk.CTkLabel(shortcuts_frame, text="Raccourci pour Démarrer/Arrêter l'enregistrement :", text_color="white", font=("Arial", 11, "bold")).pack(anchor='w', pady=(0,2))
        record_hotkey_row = ctk.CTkFrame(shortcuts_frame, fg_color="#1f1f1f")
        record_hotkey_row.pack(fill=tk.X, pady=(0, 15))
        record_hotkey_entry = ctk.CTkEntry(record_hotkey_row, font=("Consolas", 11))
        record_hotkey_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        ctk.CTkButton(record_hotkey_row, text="Définir…", command=lambda: self._open_hotkey_capture(record_hotkey_entry), font=("Arial", 11)).pack(side=tk.LEFT, padx=(8,0))
        # Charger depuis AppData
        try:
            record_hotkey_entry.insert(0, user_settings.get("record_hotkey", "<ctrl>+<alt>+s"))
        except Exception:
            pass

        # Raccourci Push‑to‑talk
        ptt_row = ctk.CTkFrame(shortcuts_frame, fg_color="#1f1f1f")
        ctk.CTkLabel(ptt_row, text="Raccourci Push‑to‑talk (maintenir) :", text_color="white", font=("Arial", 11, "bold")).pack(anchor='w', pady=(0,2))
        ptt_hotkey_entry = ctk.CTkEntry(ptt_row, font=("Consolas", 11))
        ptt_hotkey_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        ctk.CTkButton(ptt_row, text="Définir…", command=lambda: self._open_hotkey_capture(ptt_hotkey_entry), font=("Arial", 11)).pack(side=tk.LEFT, padx=(8,0))
        try:
            ptt_hotkey_entry.insert(0, user_settings.get("ptt_hotkey", "<ctrl>+<shift>+<space>"))
        except Exception:
            pass
        # Afficher la ligne PTT seulement si le mode est ptt
        if (user_settings.get("record_mode", "toggle") if user_settings else "toggle") == "ptt":
            ptt_row.pack(fill=tk.X, pady=(0, 15))
        # Raccourci Ouvrir Fenêtre  
        ctk.CTkLabel(shortcuts_frame, text="Raccourci pour Ouvrir cette fenêtre :", text_color="white", font=("Arial", 11, "bold")).pack(anchor='w', pady=(0,2))
        open_hotkey_row = ctk.CTkFrame(shortcuts_frame, fg_color="#1f1f1f")
        open_hotkey_row.pack(fill=tk.X, pady=(0, 15))
        open_hotkey_entry = ctk.CTkEntry(open_hotkey_row, font=("Consolas", 11))
        open_hotkey_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        ctk.CTkButton(open_hotkey_row, text="Définir…", command=lambda: self._open_hotkey_capture(open_hotkey_entry), font=("Arial", 11)).pack(side=tk.LEFT, padx=(8,0))
        try:
            open_hotkey_entry.insert(0, user_settings.get("open_window_hotkey", "<ctrl>+<alt>+o"))
        except Exception:
            pass

        # Références pour auto-application des hotkeys et callback de sauvegarde
        self._record_hotkey_entry = record_hotkey_entry
        self._open_hotkey_entry = open_hotkey_entry
        self._settings_save_callback = save_callback
        self._ptt_hotkey_entry = ptt_hotkey_entry if 'ptt_hotkey_entry' in locals() else None
        self._shortcut_label = shortcut_label
        self._record_mode_var = record_mode_var
        
        # Aide pour les raccourcis (à la fin)
        help_text = "Modificateurs: <ctrl>, <alt>, <shift>, <cmd> (Mac)\nTouches spéciales: <space>, <tab>, <enter>, <esc>, <f1>-<f12>\nExemples: <ctrl>+<shift>+r, <alt>+<space>, <f9>"
        help_label = ctk.CTkLabel(shortcuts_frame, text=help_text, text_color="#aaaaaa", 
                                  font=("Consolas", 10), justify=tk.LEFT)
        help_label.pack(anchor='w', pady=(6, 0))
        
        # Séparateur
        separator3 = ctk.CTkFrame(settings_frame, height=1, fg_color="#555555")
        separator3.pack(fill=tk.X, pady=(10, 15))
        
        # Bouton de fermeture complète (discret)
        quit_frame = ctk.CTkFrame(settings_frame, fg_color="#2b2b2b")
        quit_frame.pack(fill=tk.X, pady=(0, 5))
        
        ctk.CTkButton(quit_frame, text="⚠️ Fermer complètement l'application", 
                      command=self._quit_application, fg_color="#6c757d", text_color="white",
                      hover_color="#5a6268", font=("Arial", 9)).pack(side=tk.RIGHT)

        # Fonction pour sauvegarder la configuration complète
        def save_settings():
            # Convertir les valeurs d'affichage en valeurs API
            display_provider = transcription_provider_var.get()
            api_provider = provider_display_to_api.get(display_provider, "Google")
            
            display_language = language_var.get()
            api_language = language_display_to_api.get(display_language, "fr-FR")
            
            new_config = {
                "record_hotkey": record_hotkey_entry.get().strip(),
                "open_window_hotkey": open_hotkey_entry.get().strip(),
                "record_mode": record_mode_var.get(),
                # Toujours persister ptt_hotkey même si on est en toggle (évite de le perdre)
                "ptt_hotkey": (ptt_hotkey_entry.get().strip() if 'ptt_hotkey_entry' in locals() and ptt_hotkey_entry.get().strip() else main.user_settings.get("ptt_hotkey", "<ctrl>+<shift>+<space>")),
                "enable_sounds": sounds_var.get(),
                "paste_at_cursor": paste_var.get(),
                "auto_start": auto_start_var.get(),
                "transcription_provider": api_provider,
                "language": api_language,
                "smart_formatting": smart_format_var.get(),
                # ajouter aussi l'index micro courant si liste disponible
                **({"input_device_index": next((idx for idx, label in devices if label == mic_var.get()), None)} if 'devices' in locals() else {}),
            }
            if save_callback:
                try:
                    # Appeler le callback et récupérer les paramètres sauvegardés
                    result = save_callback(new_config)
                    if result and isinstance(result, dict):
                        # Mettre à jour les champs avec les valeurs effectivement sauvegardées
                        current_config = result.get('current_config', {})
                        current_user_settings = result.get('current_user_settings', {})
                        
                        # Recharger les raccourcis depuis AppData
                        record_hotkey_entry.delete(0, tk.END)
                        record_hotkey_entry.insert(0, current_user_settings.get("record_hotkey", "<ctrl>+<alt>+s"))
                        
                        open_hotkey_entry.delete(0, tk.END)
                        open_hotkey_entry.insert(0, current_user_settings.get("open_window_hotkey", "<ctrl>+<alt>+o"))

                        # Recharger le mode/ptt
                        record_mode_var.set(current_user_settings.get("record_mode", "toggle"))
                        if self._ptt_hotkey_entry:
                            self._ptt_hotkey_entry.delete(0, tk.END)
                            self._ptt_hotkey_entry.insert(0, current_user_settings.get("ptt_hotkey", "<ctrl>+<shift>+<space>"))
                        # Afficher/masquer ligne ptt
                        if record_mode_var.get() == "ptt":
                            ptt_row.pack(fill=tk.X, pady=(0, 15))
                        else:
                            ptt_row.pack_forget()
                        
                        # Mettre à jour l'affichage du raccourci dans la fenêtre principale selon le mode
                        mode_label = current_user_settings.get("record_mode", "toggle")
                        if mode_label == "ptt":
                            shortcut_label.config(text=f"Maintenir {current_user_settings.get('ptt_hotkey', '<ctrl>+<shift>+<space>')}")
                        else:
                            shortcut_label.config(text=f"Appuyez sur {current_user_settings.get('record_hotkey', '<ctrl>+<alt>+s')}")
                        
                        logging.info("Interface mise à jour avec les paramètres sauvegardés")
                    
                    # Feedback visuel de sauvegarde
                    save_button.config(text="✓ Sauvegardé !", bg="#28a745")
                    self.main_window.after(2000, lambda: save_button.config(text="Sauvegarder", bg="#0078d7"))
                    
                except Exception as e:
                    logging.error(f"Erreur lors de la sauvegarde: {e}")
                    # Feedback d'erreur
                    save_button.config(text="❌ Erreur", bg="#dc3545")
                    self.main_window.after(2000, lambda: save_button.config(text="Sauvegarder", bg="#0078d7"))

        # Remplacer le bouton Sauvegarder par des auto-saves (bind focus/enter)
        def commit_hotkeys(event=None):
            try:
                import main
                new_config = {
                    "record_hotkey": record_hotkey_entry.get().strip(),
                    "open_window_hotkey": open_hotkey_entry.get().strip(),
                    "record_mode": record_mode_var.get(),
                    "ptt_hotkey": (ptt_hotkey_entry.get().strip() if 'ptt_hotkey_entry' in locals() and ptt_hotkey_entry.get().strip() else main.user_settings.get("ptt_hotkey", "<ctrl>+<shift>+<space>")),
                }
                if self._settings_save_callback:
                    self._settings_save_callback(new_config)
                # rafraîchir le label
                try:
                    us = main.load_user_settings()
                    mode_label = us.get("record_mode", "toggle")
                    if mode_label == "ptt":
                        txt = f"Maintenir {us.get('ptt_hotkey', '<ctrl>+<shift>+<space>')}"
                    else:
                        txt = f"Appuyez sur {us.get('record_hotkey', '<ctrl>+<alt>+s')}"
                    if hasattr(self, '_shortcut_label') and self._shortcut_label:
                        self._shortcut_label.config(text=txt)
                except Exception:
                    pass
            except Exception:
                pass

        for ent in [record_hotkey_entry, open_hotkey_entry]:
            ent.bind("<FocusOut>", commit_hotkeys)
            ent.bind("<Return>", commit_hotkeys)
        if 'ptt_hotkey_entry' in locals():
            ptt_hotkey_entry.bind("<FocusOut>", commit_hotkeys)
            ptt_hotkey_entry.bind("<Return>", commit_hotkeys)

        # --- Onglet 3: Logs --- (ajouté après Paramètres)
        logs_tab = tk.Frame(notebook, bg="#2b2b2b")
        notebook.add(logs_tab, text='  Logs  ')
        self._logs_tab = logs_tab
        tk.Label(logs_tab, text="Logs de l'application", fg="white", bg="#2b2b2b", font=("Arial", 11, "bold")).pack(pady=(5, 4))
        # Bandeau chemin du fichier log + bouton ouvrir
        path_frame = tk.Frame(logs_tab, bg="#2b2b2b")
        path_frame.pack(fill=tk.X, padx=5, pady=(0,6))
        try:
            import main
            from voice_tool.paths import APP_DATA_DIR
            log_path = os.path.join(APP_DATA_DIR, 'voice_tool.log')
            tk.Label(path_frame, text=f"Fichier: {log_path}", fg="#aaaaaa", bg="#2b2b2b", font=("Consolas", 8)).pack(side=tk.LEFT)
            def _open_log_file():
                try:
                    if os.path.exists(log_path):
                        if platform.system() == 'Windows':
                            os.startfile(log_path)  # type: ignore
                        elif platform.system() == 'Darwin':
                            os.system(f"open '{log_path}'")
                        else:
                            os.system(f"xdg-open '{log_path}'")
                    else:
                        logging.error("Fichier de log introuvable")
                except Exception as e:
                    logging.error(f"Impossible d'ouvrir le fichier de log: {e}")
            tk.Button(path_frame, text="Ouvrir", command=_open_log_file, bg="#007bff", fg="white", relief=tk.FLAT).pack(side=tk.RIGHT)
        except Exception:
            pass
        text_frame = tk.Frame(logs_tab); text_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=(0,5))
        log_scrollbar = tk.Scrollbar(text_frame); log_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.log_text_widget = tk.Text(text_frame, wrap=tk.WORD, state='disabled', yscrollcommand=log_scrollbar.set, bg="#1e1e1e", fg="white", font=("Consolas", 10), relief=tk.FLAT, borderwidth=0, highlightthickness=0)
        self.log_text_widget.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        log_scrollbar.config(command=self.log_text_widget.yview)

    # === Utilitaires Historique & Recherche ===
    def _open_hotkey_capture(self, target_entry: tk.Entry):
        """Ouvre une petite fenêtre modale pour capturer une combinaison de touches et la formater."""
        capture = ctk.CTkToplevel(self.root)
        capture.title("Définir un raccourci")
        try:
            capture.configure(fg_color="#2b2b2b")
        except Exception:
            pass
        capture.resizable(False, False)
        capture.grab_set()
        tk.Label(capture, text="Appuyez sur la combinaison souhaitée…", fg="white", bg="#2b2b2b", font=("Arial", 10, "bold")).pack(padx=20, pady=15)
        info = tk.Label(capture, text="Ex: Ctrl+Alt+S", fg="#bbbbbb", bg="#2b2b2b")
        info.pack(pady=(0, 8))

        pressed = set()

        def to_display_combo(keys: set) -> str:
            order = ["<ctrl>", "<alt>", "<shift>", "<cmd>"]
            mods = []
            key = None
            for m in order:
                if m in keys:
                    mods.append(m)
            # any non-mod key (single char or <fX> etc.)
            others = [k for k in keys if k not in order]
            if others:
                # take first determinstically
                key = sorted(others)[0]
            parts = mods + ([key] if key else [])
            return "+".join(parts) if parts else ""

        def normalize_key(event_keysym: str) -> str:
            ks = event_keysym.lower()
            mapping = {
                "control_l": "<ctrl>",
                "control_r": "<ctrl>",
                "alt_l": "<alt>",
                "alt_r": "<alt>",
                "shift_l": "<shift>",
                "shift_r": "<shift>",
                "super_l": "<cmd>",
                "super_r": "<cmd>",
                "meta_l": "<cmd>",
                "meta_r": "<cmd>",
                "return": "<enter>",
                "escape": "<esc>",
                "space": "<space>",
                "tab": "<tab>",
            }
            if ks in mapping:
                return mapping[ks]
            # Function keys
            if ks.startswith("f") and ks[1:].isdigit():
                return f"<{ks}>"
            # Single alphanum
            if len(ks) == 1:
                return ks
            return f"<{ks}>"

        def on_key_press(event):
            k = normalize_key(event.keysym)
            pressed.add(k)
            preview.config(text=to_display_combo(pressed))

        def on_key_release(event):
            # Sur release, valider si on a au moins une touche
            combo = to_display_combo(pressed)
            if combo:
                target_entry.delete(0, tk.END)
                target_entry.insert(0, combo)
                capture.destroy()
                try:
                    if hasattr(self, '_settings_save_callback') and self._settings_save_callback:
                        record_val = self._record_hotkey_entry.get().strip() if hasattr(self, '_record_hotkey_entry') else ""
                        open_val = self._open_hotkey_entry.get().strip() if hasattr(self, '_open_hotkey_entry') else ""
                        ptt_val = self._ptt_hotkey_entry.get().strip() if hasattr(self, '_ptt_hotkey_entry') and self._ptt_hotkey_entry else ""
                        # S'assurer que record_mode courant est transmis pour éviter un retour par défaut côté backend
                        try:
                            current_mode = record_mode_var.get()
                        except Exception:
                            current_mode = None
                        new_config = {"record_mode": current_mode} if current_mode else {}
                        if record_val:
                            new_config['record_hotkey'] = record_val
                        if open_val:
                            new_config['open_window_hotkey'] = open_val
                        if target_entry is self._ptt_hotkey_entry and ptt_val:
                            new_config['ptt_hotkey'] = ptt_val
                        if new_config:
                            self._settings_save_callback(new_config)
                except Exception:
                    pass

        preview = tk.Label(capture, text="", fg="#4ECDC4", bg="#2b2b2b", font=("Consolas", 12, "bold"))
        preview.pack(pady=(0, 12))
        tk.Button(capture, text="Annuler", command=capture.destroy, bg="#6c757d", fg="white", relief=tk.FLAT).pack(pady=(0, 12))

        capture.bind("<KeyPress>", on_key_press)
        capture.bind("<KeyRelease>", on_key_release)
        capture.focus_force()

    def _history_to_display_and_actual(self, obj):
        if isinstance(obj, dict):
            return f"[{obj.get('timestamp', '')}] {obj.get('text', '')}", obj.get('text', '')
        else:
            s = str(obj)
            return s, s

    def _switch_history_view(self, mode):
        """Affiche la vue souhaitée: 'table' ou 'cartes'."""
        try:
            if mode == "table":
                if hasattr(self, 'history_cards_container') and self.history_cards_container.winfo_ismapped():
                    self.history_cards_container.pack_forget()
                if hasattr(self, 'history_table_frame') and not self.history_table_frame.winfo_ismapped():
                    self.history_table_frame.pack(fill=tk.BOTH, expand=True)
            else:
                if hasattr(self, 'history_table_frame') and self.history_table_frame.winfo_ismapped():
                    self.history_table_frame.pack_forget()
                if hasattr(self, 'history_cards_container') and not self.history_cards_container.winfo_ismapped():
                    self.history_cards_container.pack(fill=tk.BOTH, expand=True)
        except Exception:
            pass

    def _clear_history_cards(self):
        try:
            if hasattr(self, 'history_cards_container') and self.history_cards_container:
                for child in self.history_cards_container.winfo_children():
                    child.destroy()
        except Exception:
            pass

    def _create_history_card(self, parent, item):
        """Crée une carte visuelle pour un item d'historique."""
        try:
            card = ctk.CTkFrame(parent, fg_color="#242424", corner_radius=12)
            card.pack(fill=tk.X, padx=4, pady=6)

            # Contenu de la carte: en-tête (timestamp) + boutons, puis texte
            header = ctk.CTkFrame(card, fg_color="#242424")
            header.pack(fill=tk.X, padx=10, pady=(8, 2))

            ts = ""
            txt = ""
            if isinstance(item, dict):
                ts = item.get('timestamp', item.get('date', ''))
                txt = item.get('text', '')
            else:
                txt = str(item)

            ctk.CTkLabel(header, text=ts or "(sans date)", text_color="#9aa0a6", font=("Consolas", 10)).pack(side=tk.LEFT)

            # Boutons d'action à droite
            actions = ctk.CTkFrame(header, fg_color="#242424")
            actions.pack(side=tk.RIGHT)

            def _copy_and_notify():
                try:
                    pyperclip.copy(txt or "")
                except Exception:
                    pass
                # Notification succès (bannière mini‑fenêtre)
                try:
                    self.show()
                    self.show_status("success")
                except Exception:
                    pass

            # Bouton Écouter (si un audio est lié et si option activée)
            try:
                from voice_tool.settings import load_user_settings
                settings = load_user_settings()
                enable_preview = settings.get("enable_history_audio_preview", True)
            except Exception:
                enable_preview = True

            audio_path = None
            if isinstance(item, dict):
                audio_path = item.get('audio_path')

            def _play_audio():
                if not audio_path:
                    return
                try:
                    import os, platform
                    if not os.path.exists(audio_path):
                        # Message discret dans les logs, pas de popup intrusive
                        logging.warning(f"Fichier audio introuvable: {audio_path}")
                        return
                    system = platform.system()
                    if system == 'Windows':
                        os.startfile(audio_path)  # type: ignore
                    elif system == 'Darwin':
                        os.system(f"open '{audio_path}'")
                    else:
                        # Essayer avec aplay, sinon xdg-open
                        rc = os.system(f"aplay '{audio_path}' > /dev/null 2>&1")
                        if rc != 0:
                            os.system(f"xdg-open '{audio_path}'")
                except Exception as e:
                    logging.error(f"Lecture audio échouée: {e}")

            if enable_preview and audio_path:
                ctk.CTkButton(actions, text="▶", width=40, height=28, corner_radius=14, font=("Arial", 16, "bold"), command=_play_audio).pack(side=tk.LEFT, padx=(6,0))

            # Corps du texte
            body = ctk.CTkFrame(card, fg_color="#242424")
            body.pack(fill=tk.X, padx=10, pady=(0, 10))
            body_label = ctk.CTkLabel(body, text=txt, text_color="white", font=("Arial", 11), justify=tk.LEFT, wraplength=680)
            body_label.pack(anchor='w')
            try:
                body_label.bind("<Double-Button-1>", lambda e: _copy_and_notify())
            except Exception:
                pass
        except Exception:
            pass

    def _render_history_list(self, items):
        # Vider la listbox
        # Reset Treeview
        view_mode = None
        try:
            view_mode = self._history_view_mode.get()
        except Exception:
            view_mode = "cartes"

        # Afficher les plus récents en premier
        items_to_display = list(items)[::-1]

        if view_mode == "table":
            if self.history_tree is None:
                return
            for iid in self.history_tree.get_children():
                self.history_tree.delete(iid)
            self._tree_id_to_obj = {}
            for idx, item in enumerate(items_to_display):
                time_col = ""
                text_col = ""
                if isinstance(item, dict):
                    time_col = item.get('timestamp', item.get('date', ''))
                    text_col = item.get('text', '')
                else:
                    text_col = str(item)
                tag = 'evenrow' if (idx % 2 == 0) else 'oddrow'
                iid = self.history_tree.insert("", tk.END, values=(time_col, text_col), tags=(tag,))
                self._tree_id_to_obj[iid] = item
        else:
            # Vue cartes (rendu borné pour éviter le lag sur gros historiques)
            self._clear_history_cards()
            try:
                import main
                limit = int(main.load_user_settings().get("history_cards_render_limit", 150))
            except Exception:
                limit = 150
            # Rendre seulement les N premiers visibles (les plus récents)
            for idx, item in enumerate(items_to_display):
                if idx >= max(10, limit):  # toujours au moins 10
                    break
                self._create_history_card(self.history_cards_container, item)
            # Si coupé, afficher une note discrète
            if len(items_to_display) > max(10, limit):
                try:
                    note = ctk.CTkLabel(self.history_cards_container, text=f"Affichage de {max(10, limit)} éléments sur {len(items_to_display)} (utilisez la recherche pour filtrer)", text_color="#888888", font=("Arial", 10))
                    note.pack(pady=(4,8))
                except Exception:
                    pass

        self._filtered_history_items = list(items_to_display)
        # Mettre à jour le compteur
        try:
            total = len(self._history_master)
            filtered = len(items_to_display)
            query = (self.history_search_var.get() or "").strip()
            if query:
                txt = f"{filtered} résultat(s) sur {total}"
            else:
                txt = f"{total} élément(s)"
            if hasattr(self, 'history_count_label') and self.history_count_label:
                self.history_count_label.config(text=txt)
        except Exception:
            pass

    def _apply_history_filter(self):
        query = (self.history_search_var.get() or "").strip().lower()
        if not query:
            self._render_history_list(self._history_master)
            # gérer label vide
            try:
                if len(self._history_master) == 0:
                    self.history_empty_label.pack(pady=(10,0))
                else:
                    self.history_empty_label.pack_forget()
            except Exception:
                pass
            return
        filtered = []
        for item in self._history_master:
            display_text, actual_text = self._history_to_display_and_actual(item)
            if query in display_text.lower() or query in actual_text.lower():
                filtered.append(item)
        self._render_history_list(filtered)
        # gérer label vide
        try:
            if len(filtered) == 0:
                self.history_empty_label.pack(pady=(10,0))
            else:
                self.history_empty_label.pack_forget()
        except Exception:
            pass

    def _on_search_changed(self):
        # Debounce pour éviter de re-filtrer trop souvent
        if self._search_after_id is not None:
            try:
                self.root.after_cancel(self._search_after_id)
            except Exception:
                pass
        self._search_after_id = self.root.after(150, self._apply_history_filter)

    def _clear_search(self):
        self.history_search_var.set("")

        # S'assurer que la référence est nettoyée à la fermeture de la fenêtre
        def _on_close():
            try:
                self._history_watch_active = False
            except Exception:
                pass
            # Persist geometry + state au moment de la fermeture
            try:
                import main
                state = None
                try:
                    state = self.main_window.state()
                except Exception:
                    state = None
                geom = None
                try:
                    geom = self.main_window.geometry()
                except Exception:
                    geom = None
                if state:
                    main.user_settings.update({"main_window_state": state})
                if geom:
                    main.user_settings.update({"main_window_geometry": geom})
                main.save_user_settings(main.user_settings)
            except Exception:
                pass
            self.main_window.destroy()
            setattr(self, 'main_window', None)
            setattr(self, 'log_text_widget', None)
            setattr(self, 'history_listbox', None)
            setattr(self, 'record_button', None)
        self.main_window.protocol("WM_DELETE_WINDOW", _on_close)

    def run(self):
        self.root.mainloop()

    # === Watcher d'historique (polling mtime) ===
    def _start_history_file_watch(self):
        try:
            from voice_tool.paths import HISTORY_FILE
            import os
            if os.path.exists(HISTORY_FILE):
                try:
                    self._history_file_last_mtime = os.path.getmtime(HISTORY_FILE)
                except Exception:
                    self._history_file_last_mtime = None
            self._history_watch_active = True
            # Premier poll dans ~1s
            self.root.after(1000, self._poll_history_file)
        except Exception:
            pass

    def _poll_history_file(self):
        if not self._history_watch_active:
            return
        try:
            from voice_tool.paths import HISTORY_FILE
            import os
            mtime = None
            try:
                if os.path.exists(HISTORY_FILE):
                    mtime = os.path.getmtime(HISTORY_FILE)
            except Exception:
                mtime = None
            if mtime and self._history_file_last_mtime and mtime <= self._history_file_last_mtime:
                pass
            else:
                # mtime a changé (ou premier passage)
                self._history_file_last_mtime = mtime
                self._reload_history_from_disk()
        except Exception:
            pass
        # Replanifier
        try:
            self.root.after(1200, self._poll_history_file)
        except Exception:
            pass

    def _reload_history_from_disk(self):
        try:
            import main
            # Charger depuis disque (thread UI; handle JSON partiel via try/except)
            new_hist = main.load_transcription_history()
            if isinstance(new_hist, list):
                # Mettre à jour l’état global et local
                main.transcription_history = list(new_hist)
                self._history_master = list(new_hist)
                self._apply_history_filter()
        except Exception:
            # Ignorer les erreurs de lecture; on réessaiera au prochain tick
            pass

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
