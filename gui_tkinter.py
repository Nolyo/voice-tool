
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


    def set_mode(self, mode):
        logging.info(f"GUI Tkinter: Changement de mode vers: {mode}")
        self.current_mode = mode
        if mode == "recording":
            # Simplement dessiner le visualiseur - pas de gestion complexe des layers
            self.draw_visualizer()
        elif mode == "processing":
            if self.status_label and self.status_label.winfo_exists():
                self.status_label.config(text="Traitement...")
                # Pas de tkraise/lower - laissons Tkinter gérer
        else: # idle mode
            # Mode idle - rien de spécial à faire
            pass
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
        """Affiche la fenêtre et s'assure qu'elle est correctement positionnée"""
        self.window.deiconify() # Affiche la fenêtre
        # S'assurer que la fenêtre est au premier plan et correctement positionnée
        self.window.lift()  # Mettre au premier plan
        self.window.attributes("-topmost", True)  # Réactiver topmost au cas où
        # Repositionner au cas où elle aurait dérivé
        self.center_window()

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
        
        # Vider la listbox
        self.history_listbox.delete(0, tk.END)
        if hasattr(self.history_listbox, 'text_data'):
            self.history_listbox.text_data = {}
        
        # Recharger l'historique
        for index, item in enumerate(main.transcription_history):
            if isinstance(item, dict):
                display_text = f"[{item['timestamp']}] {item['text']}"
                actual_text = item['text']
            else:
                display_text = str(item)
                actual_text = str(item)
            
            self.history_listbox.insert(tk.END, display_text)
            if not hasattr(self.history_listbox, 'text_data'):
                self.history_listbox.text_data = {}
            self.history_listbox.text_data[index] = actual_text


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
        
        # Afficher le raccourci configuré
        if current_config:
            current_shortcut = current_config.get('record_hotkey', '<ctrl>+<alt>+s')
        else:
            import main
            current_shortcut = main.config.get('record_hotkey', '<ctrl>+<alt>+s')
        shortcut_label = tk.Label(shortcut_frame, text=f"Appuyez sur {current_shortcut}", fg="#4ECDC4", bg="#1e1e1e", font=("Arial", 11, "bold"))
        shortcut_label.pack(pady=(2,8))
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
        
        # Définir les variables AVANT la fonction
        sounds_var = tk.BooleanVar()
        paste_var = tk.BooleanVar()
        auto_start_var = tk.BooleanVar()
        
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
                    "language": api_language
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
                "enable_sounds": sounds_var.get(),
                "paste_at_cursor": paste_var.get(),
                "auto_start": auto_start_var.get(),
                "transcription_provider": api_provider,
                "language": api_language
            }
            if save_callback:
                try:
                    # Appeler le callback et récupérer les paramètres sauvegardés
                    result = save_callback(new_config)
                    if result and isinstance(result, dict):
                        # Mettre à jour les champs avec les valeurs effectivement sauvegardées
                        current_config = result.get('current_config', {})
                        current_user_settings = result.get('current_user_settings', {})
                        
                        # Recharger les raccourcis depuis la config système
                        record_hotkey_entry.delete(0, tk.END)
                        record_hotkey_entry.insert(0, current_config.get("record_hotkey", ""))
                        
                        open_hotkey_entry.delete(0, tk.END)
                        open_hotkey_entry.insert(0, current_config.get("open_window_hotkey", ""))
                        
                        # Mettre à jour l'affichage du raccourci dans la fenêtre principale
                        new_shortcut = current_config.get("record_hotkey", "<ctrl>+<alt>+s")
                        shortcut_label.config(text=f"Appuyez sur {new_shortcut}")
                        
                        logging.info("Interface mise à jour avec les paramètres sauvegardés")
                    
                    # Feedback visuel de sauvegarde
                    save_button.config(text="✓ Sauvegardé !", bg="#28a745")
                    self.main_window.after(2000, lambda: save_button.config(text="Sauvegarder", bg="#0078d7"))
                    
                except Exception as e:
                    logging.error(f"Erreur lors de la sauvegarde: {e}")
                    # Feedback d'erreur
                    save_button.config(text="❌ Erreur", bg="#dc3545")
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
