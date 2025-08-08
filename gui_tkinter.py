
import tkinter as tk
import threading
import time
import numpy as np
import logging
from tkinter import ttk
import pyperclip
import os
import platform
from PIL import ImageTk, Image
import sounddevice as sd

logging.basicConfig(level=logging.INFO)

class VisualizerWindowTkinter:
    def __init__(self, icon_path=None):
        self.root = tk.Tk()
        self.root.title("Voice Tool")  # Définir le titre de l'application
        self.root.withdraw() # Cache la fenêtre principale Tkinter par défaut
        self.icon_path = icon_path
        
        # Appliquer l'icône à la fenêtre root
        if self.icon_path:
            self.set_window_icon(self.root)
        
        self.main_window = None # Pour garder une référence à la fenêtre principale
        self.log_text_widget = None # Pour le widget qui affichera les logs
        self.history_listbox = None # Pour la Listbox de l'historique
        # Recherche et gestion d'historique (filtrage)
        self.history_search_var = tk.StringVar()
        self._search_after_id = None
        self._history_master = []  # liste des items d'historique (objets d'origine)
        self._filtered_history_items = []  # vue filtrée courante
        
        self.window = tk.Toplevel(self.root)
        self.window.title("Voice Tool - Visualizer")  # Titre pour la fenêtre de visualisation
        self.set_window_icon(self.window) # Appliquer l'icône à la fenêtre de visualisation
        self.window.overrideredirect(True) # Supprime la barre de titre et les bordures
        self.window.attributes("-topmost", True) # Toujours au-dessus
        self.window.geometry("300x60") # Taille ajustée pour le nouveau design
        self.window.configure(bg='#1C1C1C') # Fond sombre moderne
        self.window.attributes("-alpha", 0.9) # Un peu plus transparent

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

        # Canvas pour le visualiseur
        self.canvas = tk.Canvas(self.window, width=300, height=60, bg='#1C1C1C', highlightthickness=0)
        self.canvas.place(x=0, y=0, relwidth=1, relheight=1)

        # Label pour les statuts (Succès, Erreur, etc.)
        self.status_label = tk.Label(self.window, text="", fg="#1C1C1C", bg="white", font=("Arial", 12, "bold"))
        self.status_label.place(relx=0.5, rely=0.5, anchor=tk.CENTER)
        self.status_label.lower() 

        self.audio_levels = np.zeros(60) # Plus de barres pour un effet plus fluide

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
                photo_img = ImageTk.PhotoImage(pil_img)
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
            self.audio_levels = np.roll(self.audio_levels, -1)
            self.audio_levels[-1] = new_level
            self.draw_visualizer()

    def draw_visualizer(self):
        self.canvas.delete("all")
        
        canvas_height = self.canvas.winfo_height()
        canvas_width = self.canvas.winfo_width()
        
        num_bars = len(self.audio_levels)
        bar_width = 3  # Largeur fixe pour des barres fines
        spacing = 2    # Espacement entre les barres
        total_width = num_bars * (bar_width + spacing) - spacing
        start_x = (canvas_width - total_width) / 2

        for i, level in enumerate(self.audio_levels):
            x1 = start_x + i * (bar_width + spacing)
            x2 = x1 + bar_width
            
            # Courbe de croissance non-linéaire pour un effet plus doux
            # La racine carrée rend les sons faibles plus visibles
            bar_height = int(np.sqrt(level) * (canvas_height * 0.9))
            bar_height = max(2, bar_height) # Hauteur minimale de 2px
            
            y1 = (canvas_height - bar_height) / 2
            y2 = y1 + bar_height
            
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
        self.canvas.create_oval(x1, y1, x2, y2, fill=fill, outline="")

    def _draw_processing_interface(self):
        """Dessine une interface de traitement professionnelle avec l'icône de l'app."""
        canvas_width = self.canvas.winfo_width()
        canvas_height = self.canvas.winfo_height()
        
        # Fond dégradé subtil
        self.canvas.create_rectangle(0, 0, canvas_width, canvas_height, 
                                   fill='#1C1C1C', outline='')
        
        # Cercle d'arrière-plan pour l'icône (style moderne)
        center_x = canvas_width // 2
        center_y = canvas_height // 2 - 8  # Remonter légèrement l'icône
        
        # Cercle principal (bleu Voice Tool)
        self.canvas.create_oval(center_x - 20, center_y - 15, 
                              center_x + 20, center_y + 15, 
                              fill='#2196F3', outline='#1976D2', width=2)
        
        # Icône microphone stylisé (blanc)
        # Corps du micro
        self.canvas.create_oval(center_x - 8, center_y - 8, 
                              center_x + 8, center_y + 2, 
                              fill='white', outline='')
        
        # Tige du micro
        self.canvas.create_rectangle(center_x - 1, center_y + 2, 
                                   center_x + 1, center_y + 8, 
                                   fill='white', outline='')
        
        # Base du micro
        self.canvas.create_rectangle(center_x - 4, center_y + 8, 
                                   center_x + 4, center_y + 10, 
                                   fill='white', outline='')
        
        # Onde sonore animée (style moderne)
        wave_color = '#4ECDC4'
        # Arc de droite
        self.canvas.create_arc(center_x + 12, center_y - 8, 
                             center_x + 25, center_y + 5, 
                             start=135, extent=90, 
                             outline=wave_color, width=2, style='arc')
        
        # Texte "Voice Tool" discret en bas - même position que les autres
        self.canvas.create_text(center_x, canvas_height - 6, 
                              text="Voice Tool", 
                              fill='#666666', 
                              font=('Arial', 7, 'bold'))
        
        # Animation de points de chargement
        self._animate_processing_dots()

    def _animate_processing_dots(self):
        """Anime les points de traitement."""
        if self.current_mode != "processing":
            return
            
        canvas_width = self.canvas.winfo_width()
        canvas_height = self.canvas.winfo_height()
        center_x = canvas_width // 2
        
        # Supprimer les anciens points
        self.canvas.delete("processing_dots")
        self.canvas.delete("processing_text")
        
        # Texte "Traitement en cours" - même position que les autres
        self.canvas.create_text(center_x, canvas_height - 18, 
                              text="Traitement", 
                              fill='#4ECDC4', 
                              font=('Arial', 9, 'bold'),
                              tags="processing_text")
        
        # Points animés
        import time
        dot_count = int(time.time() * 2) % 4  # 2 cycles par seconde
        dots_text = "." * dot_count
        
        self.canvas.create_text(center_x + 55, canvas_height - 18, 
                              text=dots_text, 
                              fill='#4ECDC4', 
                              font=('Arial', 9, 'bold'),
                              tags="processing_dots")
        
        # Programmer la prochaine animation
        self.window.after(250, self._animate_processing_dots)


    def set_mode(self, mode):
        logging.info(f"GUI Tkinter: Changement de mode vers: {mode}")
        self.current_mode = mode
        if mode == "recording":
            # Simplement dessiner le visualiseur - pas de gestion complexe des layers
            self.draw_visualizer()
        elif mode == "processing":
            # Effacer le canvas et dessiner une interface de traitement professionnelle
            self.canvas.delete("all")
            self._draw_processing_interface()
        else: # idle mode
            # Mode idle - rien de spécial à faire
            pass

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
        """Dessine une interface de succès professionnelle."""
        canvas_width = self.canvas.winfo_width()
        canvas_height = self.canvas.winfo_height()
        center_x = canvas_width // 2
        center_y = canvas_height // 2 - 8  # Remonter l'icône pour faire de la place
        
        # Fond
        self.canvas.create_rectangle(0, 0, canvas_width, canvas_height, 
                                   fill='#1C1C1C', outline='')
        
        # Cercle de succès (vert moderne) - taille réduite
        self.canvas.create_oval(center_x - 15, center_y - 12, 
                              center_x + 15, center_y + 12, 
                              fill='#4CAF50', outline='#2E7D32', width=2)
        
        # Checkmark stylisé - proportions ajustées
        # Trait 1 du checkmark
        self.canvas.create_line(center_x - 6, center_y - 1,
                              center_x - 2, center_y + 3,
                              fill='white', width=2, capstyle='round')
        # Trait 2 du checkmark
        self.canvas.create_line(center_x - 2, center_y + 3,
                              center_x + 6, center_y - 5,
                              fill='white', width=2, capstyle='round')
        
        # Texte "Transcription réussie !" - descendre un peu plus
        self.canvas.create_text(center_x, canvas_height - 18, 
                              text="Copie réussie !", 
                              fill='#4CAF50', 
                              font=('Arial', 9, 'bold'))
        
        # Texte "Voice Tool" discret
        self.canvas.create_text(center_x, canvas_height - 6, 
                              text="Voice Tool", 
                              fill='#666666', 
                              font=('Arial', 7, 'bold'))

    def _draw_error_interface(self):
        """Dessine une interface d'erreur professionnelle."""
        canvas_width = self.canvas.winfo_width()
        canvas_height = self.canvas.winfo_height()
        center_x = canvas_width // 2
        center_y = canvas_height // 2 - 8  # Remonter l'icône pour faire de la place
        
        # Fond
        self.canvas.create_rectangle(0, 0, canvas_width, canvas_height, 
                                   fill='#1C1C1C', outline='')
        
        # Cercle d'erreur (rouge moderne) - taille réduite
        self.canvas.create_oval(center_x - 15, center_y - 12, 
                              center_x + 15, center_y + 12, 
                              fill='#F44336', outline='#C62828', width=2)
        
        # X stylisé - proportions ajustées
        # Trait 1 du X
        self.canvas.create_line(center_x - 5, center_y - 5,
                              center_x + 5, center_y + 5,
                              fill='white', width=2, capstyle='round')
        # Trait 2 du X
        self.canvas.create_line(center_x + 5, center_y - 5,
                              center_x - 5, center_y + 5,
                              fill='white', width=2, capstyle='round')
        
        # Texte "Échec de la transcription" - descendre un peu plus
        self.canvas.create_text(center_x, canvas_height - 18, 
                              text="Échec de la transcription", 
                              fill='#F44336', 
                              font=('Arial', 9, 'bold'))
        
        # Texte "Voice Tool" discret
        self.canvas.create_text(center_x, canvas_height - 6, 
                              text="Voice Tool", 
                              fill='#666666', 
                              font=('Arial', 7, 'bold'))

    def show(self):
        """Affiche la fenêtre et s'assure qu'elle est correctement positionnée"""
        self.window.deiconify() # Affiche la fenêtre
        # S'assurer que la fenêtre est au premier plan et correctement positionnée
        self.window.lift()  # Mettre au premier plan
        self.window.attributes("-topmost", True)  # Réactiver topmost au cas où
        # Repositionner au cas où elle aurait dérivé
        self.center_window()

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
        """Ajoute une nouvelle transcription à la Listbox de l'historique, de manière thread-safe."""
        if self.history_listbox and self.history_listbox.winfo_exists():
            def insert_item():
                # Ajouter à la liste maître puis re-filtrer pour cohérence avec la vue
                self._history_master.append(history_item)
                self._apply_history_filter()
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
        if not self.history_listbox:
            return
        
        selected_indices = self.history_listbox.curselection()
        if not selected_indices:
            logging.info("Aucun élément sélectionné pour suppression.")
            return
        
        selected_index = selected_indices[0]
        # Récupérer l'objet d'historique correspondant dans la vue filtrée
        if selected_index >= len(self._filtered_history_items):
            return
        history_obj = self._filtered_history_items[selected_index]

        # Confirmer la suppression
        import tkinter.messagebox as msgbox
        if msgbox.askyesno("Confirmation", "Êtes-vous sûr de vouloir supprimer cette transcription ?"):
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
                          "Êtes-vous sûr de vouloir fermer complètement Voice Tool ?\n\nL'application se fermera et ne fonctionnera plus en arrière-plan."):
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

    def _clear_all_history(self):
        """Supprime tout l'historique après confirmation."""
        import tkinter.messagebox as msgbox
        if msgbox.askyesno("Confirmation", "Êtes-vous sûr de vouloir supprimer tout l'historique des transcriptions ?\n\nCette action est irréversible."):
            try:
                import main
                main.clear_all_transcription_history()
                # Effacer la listbox dans l'interface
                if self.history_listbox:
                    self.history_listbox.delete(0, tk.END)
                    # Nettoyer aussi les données associées
                    if hasattr(self.history_listbox, 'text_data'):
                        self.history_listbox.text_data = {}
                # Nettoyer les structures locales
                self._history_master = []
                self._filtered_history_items = []
                logging.info("Tout l'historique a été effacé.")
                msgbox.showinfo("Succès", "L'historique a été complètement effacé.")
            except Exception as e:
                logging.error(f"Erreur lors de la suppression de l'historique: {e}")
                msgbox.showerror("Erreur", "Une erreur est survenue lors de la suppression de l'historique.")

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
            msgbox.showwarning("Attention", "Aucune transcription à exporter.")
            return
        
        # Demander le format d'export
        export_window = tk.Toplevel(self.root)
        export_window.title("Exporter l'historique")
        export_window.geometry("300x220")
        export_window.configure(bg="#2b2b2b")
        export_window.resizable(False, False)
        
        # Centrer la fenêtre
        export_window.update_idletasks()
        x = export_window.winfo_screenwidth() // 2 - export_window.winfo_width() // 2
        y = export_window.winfo_screenheight() // 2 - export_window.winfo_height() // 2
        export_window.geometry(f"+{x}+{y}")
        
        tk.Label(export_window, text="Choisissez le format d'export :", 
                fg="white", bg="#2b2b2b", font=("Arial", 12, "bold")).pack(pady=(15, 10))
        
        def export_csv():
            filename = filedialog.asksaveasfilename(
                defaultextension=".csv",
                filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
                title="Sauvegarder en CSV"
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
                    msgbox.showinfo("Succès", f"Historique exporté vers {filename}")
                except Exception as e:
                    msgbox.showerror("Erreur", f"Erreur lors de l'export CSV: {e}")
                finally:
                    export_window.destroy()
        
        def export_txt():
            filename = filedialog.asksaveasfilename(
                defaultextension=".txt",
                filetypes=[("Text files", "*.txt"), ("All files", "*.*")],
                title="Sauvegarder en TXT"
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
                    msgbox.showinfo("Succès", f"Historique exporté vers {filename}")
                except Exception as e:
                    msgbox.showerror("Erreur", f"Erreur lors de l'export TXT: {e}")
                finally:
                    export_window.destroy()
        
        def export_json():
            filename = filedialog.asksaveasfilename(
                defaultextension=".json",
                filetypes=[("JSON files", "*.json"), ("All files", "*.*")],
                title="Sauvegarder en JSON"
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
                    msgbox.showinfo("Succès", f"Historique exporté vers {filename}")
                except Exception as e:
                    msgbox.showerror("Erreur", f"Erreur lors de l'export JSON: {e}")
                finally:
                    export_window.destroy()
        
        # Boutons d'export
        btn_frame = tk.Frame(export_window, bg="#2b2b2b")
        btn_frame.pack(pady=10)
        
        tk.Button(btn_frame, text="📊  CSV", command=export_csv, bg="#28a745", fg="white",
                  relief=tk.FLAT, font=("Arial", 10), width=15, height=1).pack(pady=5)
        tk.Button(btn_frame, text="📄  TXT", command=export_txt, bg="#6f42c1", fg="white",
                  relief=tk.FLAT, font=("Arial", 10), width=15, height=1).pack(pady=5)
        tk.Button(btn_frame, text="🔧  JSON", command=export_json, bg="#fd7e14", fg="white",
                  relief=tk.FLAT, font=("Arial", 10), width=15, height=1).pack(pady=5)
        
        tk.Button(export_window, text="Annuler", command=export_window.destroy,
                  bg="#6c757d", fg="white", relief=tk.FLAT, font=("Arial", 10)).pack(pady=10)

    def _import_history(self):
        """Importe un historique depuis un fichier JSON."""
        import tkinter.messagebox as msgbox
        import tkinter.filedialog as filedialog
        import main
        import json
        
        filename = filedialog.askopenfilename(
            filetypes=[("JSON files", "*.json"), ("All files", "*.*忽视")],
            title="Importer un historique JSON"
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
                    "Annuler = Annuler l'import")
                
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
            
            msgbox.showinfo("Succès", f"{len(imported_transcriptions)} transcriptions importées avec succès !")
            
        except Exception as e:
            msgbox.showerror("Erreur", f"Erreur lors de l'import: {e}")

    def _refresh_history_display(self):
        """Rafraîchit l'affichage de l'historique après import."""
        if not self.history_listbox:
            return
        
        import main
        # Mettre à jour la liste maître depuis la source et re-filtrer
        self._history_master = list(main.transcription_history)
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

        self.main_window = tk.Toplevel(self.root)
        self.main_window.title("Voice Tool")
        self.main_window.geometry("800x700")  # Augmenté de 200px au total (600->700) pour cacher le bouton sauvegarder
        
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

        # --- Onglet 1: Historique ---
        history_tab = tk.Frame(notebook, bg="#2b2b2b")
        notebook.add(history_tab, text='  Historique  ')
        history_frame = tk.Frame(history_tab, bg="#2b2b2b"); history_frame.pack(fill=tk.BOTH, expand=True)
        tk.Label(history_frame, text="Historique des transcriptions", fg="white", bg="#2b2b2b", font=("Arial", 11, "bold")).pack(pady=(5, 10))

        # Barre de recherche
        search_frame = tk.Frame(history_frame, bg="#2b2b2b")
        search_frame.pack(fill=tk.X, padx=5, pady=(0, 10))
        tk.Label(search_frame, text="Rechercher:", fg="white", bg="#2b2b2b").pack(side=tk.LEFT, padx=(0, 8))
        search_entry = tk.Entry(search_frame, textvariable=self.history_search_var, bg="#3c3c3c", fg="white", relief=tk.FLAT, insertbackground="white")
        search_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        clear_btn = tk.Button(search_frame, text="Effacer", command=lambda: self._clear_search(), bg="#6c757d", fg="white", relief=tk.FLAT)
        clear_btn.pack(side=tk.LEFT, padx=(8, 0))
        listbox_frame = tk.Frame(history_frame); listbox_frame.pack(fill=tk.BOTH, expand=True, padx=5)
        history_scrollbar = tk.Scrollbar(listbox_frame); history_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.history_listbox = tk.Listbox(listbox_frame, yscrollcommand=history_scrollbar.set, bg="#3c3c3c", fg="white", selectbackground="#0078d7", relief=tk.FLAT, borderwidth=0, highlightthickness=0, exportselection=False)
        self.history_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        history_scrollbar.config(command=self.history_listbox.yview)
        
        # Événements pour la listbox de l'historique
        self.history_listbox.bind("<Double-Button-1>", self._on_history_double_click)
        self.history_listbox.bind("<Button-3>", self._on_history_right_click)  # Clic droit
        # Charger l'historique dans la liste maître et rendre la vue (filtrée)
        self._history_master = list(history) if history else []
        self._apply_history_filter()

        # Déclencher le filtrage à la saisie (avec debounce)
        try:
            self.history_search_var.trace_add("write", lambda *_: self._on_search_changed())
        except Exception:
            pass
        
        # Indication pour les interactions avec l'historique
        help_frame = tk.Frame(history_frame, bg="#2b2b2b")
        help_frame.pack(pady=(10,5), padx=5, fill=tk.X)
        
        tk.Label(help_frame, text="💡 Double-clic pour copier • Clic droit pour le menu", 
                fg="#888888", bg="#2b2b2b", font=("Arial", 9), justify=tk.LEFT).pack(side=tk.LEFT)

        # Boutons d'action
        buttons_frame = tk.Frame(help_frame, bg="#2b2b2b")
        buttons_frame.pack(side=tk.RIGHT)
        
        # Bouton d'import
        tk.Button(buttons_frame, text="📥 Import", 
                  command=self._import_history, bg="#28a745", fg="white", 
                  relief=tk.FLAT, activebackground="#218838", activeforeground="white",
                  font=("Arial", 8, "bold")).pack(side=tk.LEFT, padx=(0, 5))
        
        # Bouton d'export
        tk.Button(buttons_frame, text="📤 Export", 
                  command=self._export_history, bg="#007bff", fg="white", 
                  relief=tk.FLAT, activebackground="#0056b3", activeforeground="white",
                  font=("Arial", 8, "bold")).pack(side=tk.LEFT, padx=(0, 5))
        
        # Bouton pour tout effacer
        tk.Button(buttons_frame, text="🗑️ Tout effacer", 
                  command=self._clear_all_history, bg="#dc3545", fg="white", 
                  relief=tk.FLAT, activebackground="#c82333", activeforeground="white",
                  font=("Arial", 8, "bold")).pack(side=tk.LEFT)
        
        # Message informatif pour le raccourci d'enregistrement
        shortcut_frame = tk.Frame(history_frame, bg="#1e1e1e", relief=tk.RAISED, bd=1)
        shortcut_frame.pack(pady=(10,10), padx=5, fill=tk.X)
        
        tk.Label(shortcut_frame, text="🎤", fg="#FF6B6B", bg="#1e1e1e", font=("Arial", 16)).pack(pady=(8,2))
        tk.Label(shortcut_frame, text="Pour démarrer/arrêter l'enregistrement", fg="white", bg="#1e1e1e", font=("Arial", 10)).pack()
        
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
        shortcut_label = tk.Label(shortcut_frame, text=shortcut_text, fg="#4ECDC4", bg="#1e1e1e", font=("Arial", 11, "bold"))
        shortcut_label.pack(pady=(2,8))
        # Fin Onglet Historique

        # --- Onglet 2: Paramètres ---
        settings_frame = tk.Frame(notebook, bg="#2b2b2b", padx=20, pady=20)
        notebook.add(settings_frame, text='  Paramètres  ')
        
        # Définir les variables AVANT la fonction
        sounds_var = tk.BooleanVar()
        paste_var = tk.BooleanVar()
        auto_start_var = tk.BooleanVar()
        smart_format_var = tk.BooleanVar()
        
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

        # === LAYOUT 2x2 POUR LES SECTIONS ===
        
        # Frame pour la première ligne (Audio + Texte)
        top_row_frame = tk.Frame(settings_frame, bg="#2b2b2b")
        top_row_frame.pack(fill=tk.X, pady=(0, 20))
        
        # === SECTION AUDIO (à gauche) ===
        audio_frame = tk.Frame(top_row_frame, bg="#2b2b2b")
        audio_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 10))
        
        tk.Label(audio_frame, text="🔊 Audio", fg="#4CAF50", bg="#2b2b2b", font=("Arial", 12, "bold")).pack(anchor='w', pady=(0, 10))
        
        # Charger depuis les paramètres utilisateur passés en paramètre
        if user_settings and "enable_sounds" in user_settings:
            sounds_var.set(user_settings["enable_sounds"])
        elif current_config:
            sounds_var.set(current_config.get("enable_sounds", True))
        else:
            sounds_var.set(True)
        sounds_check = tk.Checkbutton(audio_frame, text="Activer les sons d'interface", 
                                     variable=sounds_var, command=auto_save_user_setting,
                                     fg="white", bg="#2b2b2b", 
                                     selectcolor="#3c3c3c", activebackground="#2b2b2b", 
                                     activeforeground="white")
        sounds_check.pack(anchor='w', pady=(0, 15))

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

        tk.Label(audio_frame, text="Microphone d'entrée :", fg="white", bg="#2b2b2b").pack(anchor='w', pady=(0,2))
        mic_var = tk.StringVar()
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

        mic_menu = ttk.OptionMenu(audio_frame, mic_var, initial_choice, *mic_choices, command=lambda *_: on_mic_changed())
        mic_menu.pack(anchor='w', padx=(0, 20), pady=(0, 10))

        # === SECTION TEXTE (à droite) ===
        text_frame = tk.Frame(top_row_frame, bg="#2b2b2b")
        text_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(10, 0))
        
        tk.Label(text_frame, text="📝 Texte", fg="#E0A800", bg="#2b2b2b", font=("Arial", 12, "bold")).pack(anchor='w', pady=(0, 10))
        
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
        paste_check = tk.Checkbutton(text_frame, text="Insérer automatiquement au curseur\naprès la transcription / copie depuis l'historique", 
                                     variable=paste_var, command=auto_save_user_setting,
                                     fg="white", bg="#2b2b2b", 
                                     wraplength=350, justify=tk.LEFT,
                                     selectcolor="#3c3c3c", activebackground="#2b2b2b", 
                                     activeforeground="white")
        paste_check.pack(anchor='w', pady=(0, 15))

        # Toggle Formatage intelligent
        try:
            if user_settings and "smart_formatting" in user_settings:
                smart_format_var.set(user_settings["smart_formatting"])
            else:
                smart_format_var.set(True)
        except Exception:
            smart_format_var.set(True)
        smart_format_check = tk.Checkbutton(
            text_frame,
            text="Activer le formatage intelligent (ponctuation, majuscule, espaces)",
            variable=smart_format_var,
            command=auto_save_user_setting,
            fg="white",
            bg="#2b2b2b",
            wraplength=350,
            justify=tk.LEFT,
            selectcolor="#3c3c3c",
            activebackground="#2b2b2b",
            activeforeground="white",
        )
        smart_format_check.pack(anchor='w', pady=(0, 15))
        
        # Séparateur
        separator1 = tk.Frame(settings_frame, height=1, bg="#555555")
        separator1.pack(fill=tk.X, pady=(0, 20))

        # Frame pour la deuxième ligne (Service + Système)
        bottom_row_frame = tk.Frame(settings_frame, bg="#2b2b2b")
        bottom_row_frame.pack(fill=tk.X, pady=(0, 20))
        
        # === SECTION TRANSCRIPTION (à gauche) ===
        transcription_frame = tk.Frame(bottom_row_frame, bg="#2b2b2b")
        transcription_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 10))
        
        tk.Label(transcription_frame, text="🤖 Service de Transcription", fg="#9C27B0", bg="#2b2b2b", font=("Arial", 12, "bold")).pack(anchor='w', pady=(0, 10))

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

        transcription_provider_var = tk.StringVar()
        language_var = tk.StringVar()

        # Charger la configuration du fournisseur et convertir pour l'affichage
        current_api_provider = user_settings.get("transcription_provider", "Google") if user_settings and "transcription_provider" in user_settings else "Google"
        current_display_provider = provider_api_to_display.get(current_api_provider, "Google")
        transcription_provider_var.set(current_display_provider)

        # Charger la configuration de langue et convertir pour l'affichage
        current_api_language = user_settings.get("language", "fr-FR") if user_settings and "language" in user_settings else "fr-FR"
        current_display_language = language_api_to_display.get(current_api_language, "🇫🇷 Français")
        language_var.set(current_display_language)

        # Créer le menu déroulant pour le fournisseur
        tk.Label(transcription_frame, text="Fournisseur de service :", fg="white", bg="#2b2b2b").pack(anchor='w', pady=(0,2))
        provider_menu = ttk.OptionMenu(transcription_frame, transcription_provider_var, current_display_provider, "Google", "OpenAI Whisper (recommandé)")
        provider_menu.pack(anchor='w', padx=(0, 20), pady=(0, 10))

        # Créer le menu déroulant pour la langue
        tk.Label(transcription_frame, text="Langue de transcription :", fg="white", bg="#2b2b2b").pack(anchor='w', pady=(0,2))
        language_menu = ttk.OptionMenu(transcription_frame, language_var, current_display_language, 
                                     "🇫🇷 Français", "🇺🇸 English", "🇪🇸 Español", "🇩🇪 Deutsch", 
                                     "🇮🇹 Italiano", "🇵🇹 Português", "🇳🇱 Nederlands")
        language_menu.pack(anchor='w', padx=(0, 20), pady=(0, 10))

        # Ajouter la trace automatique pour la sauvegarde
        transcription_provider_var.trace_add("write", lambda *_: auto_save_user_setting())
        language_var.trace_add("write", lambda *_: auto_save_user_setting())
        
        # === SECTION SYSTÈME (à droite) ===
        system_frame = tk.Frame(bottom_row_frame, bg="#2b2b2b")
        system_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(10, 0))
        
        tk.Label(system_frame, text="💻 Système", fg="#FF6B6B", bg="#2b2b2b", font=("Arial", 12, "bold")).pack(anchor='w', pady=(0, 10))
        auto_start_check = tk.Checkbutton(system_frame, text="Démarrer automatiquement avec Windows", 
                                         variable=auto_start_var, command=auto_save_user_setting,
                                         fg="white", bg="#2b2b2b", 
                                         selectcolor="#3c3c3c", activebackground="#2b2b2b", 
                                         activeforeground="white")
        auto_start_check.pack(anchor='w', pady=(0, 15))
        
        # Séparateur
        separator1b = tk.Frame(settings_frame, height=1, bg="#555555")
        separator1b.pack(fill=tk.X, pady=(0, 20))
        
        # === SECTION RACCOURCIS ===
        tk.Label(settings_frame, text="⌨️ Raccourcis & modes d'enregistrement", fg="#2196F3", bg="#2b2b2b", font=("Arial", 12, "bold")).pack(anchor='w', pady=(0, 10))
        
        # Mode d'enregistrement
        mode_row = tk.Frame(settings_frame, bg="#2b2b2b")
        mode_row.pack(fill=tk.X, pady=(0, 12))
        tk.Label(mode_row, text="Mode d'enregistrement :", fg="white", bg="#2b2b2b").pack(anchor='w')
        record_mode_var = tk.StringVar(value=(user_settings.get("record_mode", "toggle") if user_settings else "toggle"))
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
        mode_toggle = tk.Radiobutton(mode_row, text="Toggle (appuyer pour démarrer/arrêter)", value="toggle", variable=record_mode_var,
                                     command=on_mode_changed, fg="white", bg="#2b2b2b", selectcolor="#3c3c3c", activebackground="#2b2b2b", activeforeground="white")
        mode_ptt = tk.Radiobutton(mode_row, text="Push‑to‑talk (enregistrer tant que la touche est maintenue)", value="ptt", variable=record_mode_var,
                                   command=on_mode_changed, fg="white", bg="#2b2b2b", selectcolor="#3c3c3c", activebackground="#2b2b2b", activeforeground="white")
        mode_toggle.pack(anchor='w')
        mode_ptt.pack(anchor='w')

        # Raccourci Enregistrement (toggle)
        tk.Label(settings_frame, text="Raccourci pour Démarrer/Arrêter l'enregistrement :", fg="white", bg="#2b2b2b").pack(anchor='w', pady=(0,2))
        record_hotkey_row = tk.Frame(settings_frame, bg="#2b2b2b")
        record_hotkey_row.pack(fill=tk.X, pady=(0, 15))
        record_hotkey_entry = tk.Entry(record_hotkey_row, bg="#3c3c3c", fg="white", relief=tk.FLAT, insertbackground="white")
        record_hotkey_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        tk.Button(record_hotkey_row, text="Définir…", command=lambda: self._open_hotkey_capture(record_hotkey_entry), bg="#0078d7", fg="white", relief=tk.FLAT).pack(side=tk.LEFT, padx=(8,0))
        # Charger depuis AppData
        try:
            record_hotkey_entry.insert(0, user_settings.get("record_hotkey", "<ctrl>+<alt>+s"))
        except Exception:
            pass

        # Raccourci Push‑to‑talk
        ptt_row = tk.Frame(settings_frame, bg="#2b2b2b")
        tk.Label(ptt_row, text="Raccourci Push‑to‑talk (maintenir) :", fg="white", bg="#2b2b2b").pack(anchor='w', pady=(0,2))
        ptt_hotkey_entry = tk.Entry(ptt_row, bg="#3c3c3c", fg="white", relief=tk.FLAT, insertbackground="white")
        ptt_hotkey_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        tk.Button(ptt_row, text="Définir…", command=lambda: self._open_hotkey_capture(ptt_hotkey_entry), bg="#0078d7", fg="white", relief=tk.FLAT).pack(side=tk.LEFT, padx=(8,0))
        try:
            ptt_hotkey_entry.insert(0, user_settings.get("ptt_hotkey", "<ctrl>+<shift>+<space>"))
        except Exception:
            pass
        # Afficher la ligne PTT seulement si le mode est ptt
        if (user_settings.get("record_mode", "toggle") if user_settings else "toggle") == "ptt":
            ptt_row.pack(fill=tk.X, pady=(0, 15))
        # Raccourci Ouvrir Fenêtre  
        tk.Label(settings_frame, text="Raccourci pour Ouvrir cette fenêtre :", fg="white", bg="#2b2b2b").pack(anchor='w', pady=(0,2))
        open_hotkey_row = tk.Frame(settings_frame, bg="#2b2b2b")
        open_hotkey_row.pack(fill=tk.X, pady=(0, 15))
        open_hotkey_entry = tk.Entry(open_hotkey_row, bg="#3c3c3c", fg="white", relief=tk.FLAT, insertbackground="white")
        open_hotkey_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        tk.Button(open_hotkey_row, text="Définir…", command=lambda: self._open_hotkey_capture(open_hotkey_entry), bg="#0078d7", fg="white", relief=tk.FLAT).pack(side=tk.LEFT, padx=(8,0))
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
        tk.Label(logs_tab, text="Logs de l'application", fg="white", bg="#2b2b2b", font=("Arial", 11, "bold")).pack(pady=(5, 10))
        text_frame = tk.Frame(logs_tab); text_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=(0,5))
        log_scrollbar = tk.Scrollbar(text_frame); log_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.log_text_widget = tk.Text(text_frame, wrap=tk.WORD, state='disabled', yscrollcommand=log_scrollbar.set, bg="#1e1e1e", fg="white", font=("Consolas", 10), relief=tk.FLAT, borderwidth=0, highlightthickness=0)
        self.log_text_widget.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        log_scrollbar.config(command=self.log_text_widget.yview)

    # === Utilitaires Historique & Recherche ===
    def _open_hotkey_capture(self, target_entry: tk.Entry):
        """Ouvre une petite fenêtre modale pour capturer une combinaison de touches et la formater."""
        capture = tk.Toplevel(self.root)
        capture.title("Définir un raccourci")
        capture.configure(bg="#2b2b2b")
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

    def _render_history_list(self, items):
        # Vider la listbox
        self.history_listbox.delete(0, tk.END)
        if not hasattr(self.history_listbox, 'text_data'):
            self.history_listbox.text_data = {}
        else:
            self.history_listbox.text_data = {}

        for index, item in enumerate(items):
            display_text, actual_text = self._history_to_display_and_actual(item)
            self.history_listbox.insert(tk.END, display_text)
            self.history_listbox.text_data[index] = actual_text
        self._filtered_history_items = list(items)

    def _apply_history_filter(self):
        query = (self.history_search_var.get() or "").strip().lower()
        if not query:
            self._render_history_list(self._history_master)
            return
        filtered = []
        for item in self._history_master:
            display_text, actual_text = self._history_to_display_and_actual(item)
            if query in display_text.lower() or query in actual_text.lower():
                filtered.append(item)
        self._render_history_list(filtered)

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
