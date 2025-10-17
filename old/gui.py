import sys
import logging
from PySide6.QtWidgets import QApplication, QMainWindow, QWidget, QLabel
from PySide6.QtCore import Qt, QPoint, QTimer, QEvent
from PySide6.QtGui import QPainter, QColor, QLinearGradient, QFont
import numpy as np

logging.basicConfig(level=logging.INFO)

# --- Gestion des événements personnalisés pour la communication inter-threads ---
class CustomEvent(QEvent):
    EVENT_TYPE = QEvent.Type(QEvent.registerEventType())

    def __init__(self, event_name, data=None):
        super().__init__(CustomEvent.EVENT_TYPE)
        self.event_name = event_name
        self.data = data

class VisualizerWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        logging.info("Initialisation de VisualizerWindow...")

        # --- Propriétés de la fenêtre ---
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.Tool
        )
        # self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground) # Désactivé car ne fonctionne pas comme prévu

        self.setFixedSize(300, 80) # Taille fixe
        self.center() # Centrer la fenêtre

        # --- Données du visualiseur ---
        self.audio_levels = np.zeros(50) # 50 barres, initialisées à zéro
        self.bar_width = self.width() / len(self.audio_levels)

        # --- Logique de déplacement ---
        self.drag_position = None

        # --- États visuels ---
        self.current_mode = "idle" # idle, recording, processing, success, error
        self.status_label = QLabel(self) # Pour afficher les messages d'état
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.status_label.setStyleSheet("color: white; font-size: 16px;")
        self.status_label.setGeometry(0, 0, self.width(), self.height())
        self.status_label.hide() # Caché par défaut

        logging.info("VisualizerWindow initialisée.")

    def center(self):
        screen_geometry = self.screen().availableGeometry()
        self.move(
            (screen_geometry.width() - self.width()) / 2,
            (screen_geometry.height() - self.height()) / 2
        )

    def update_visualizer(self, new_level):
        """Met à jour les niveaux audio et redessine la fenêtre."""
        logging.info(f"GUI: Reçu niveau audio: {new_level:.4f}") # Ajout du log ici
        if self.current_mode == "recording":
            self.audio_levels = np.roll(self.audio_levels, -1) 
            self.audio_levels[-1] = new_level
            self.update() # Demande un rafraîchissement de la fenêtre

    def set_mode(self, mode):
        """Change le mode visuel de la fenêtre."""
        logging.info(f"GUI: Changement de mode vers: {mode}") # Ajout du log ici
        self.current_mode = mode
        if mode == "recording":
            self.status_label.hide()
        elif mode == "processing":
            self.status_label.setText("Traitement...")
            self.status_label.show()
        else:
            self.status_label.hide()
        self.update()

    def show_status(self, status_type):
        """Affiche un statut de succès ou d'erreur."""
        logging.info(f"GUI: Affichage du statut: {status_type}") # Ajout du log ici
        if status_type == "success":
            self.status_label.setText("✔ Succès !")
            self.status_label.setStyleSheet("color: lightgreen; font-size: 24px; font-weight: bold;")
        elif status_type == "error":
            self.status_label.setText("❌ Erreur !")
            self.status_label.setStyleSheet("color: red; font-size: 24px; font-weight: bold;")
        self.status_label.show()
        # On cache le statut après un court délai
        QTimer.singleShot(2000, lambda: self.status_label.hide())
        QTimer.singleShot(2000, lambda: self.set_mode("idle")) # Retourne au mode idle après notification

    def paintEvent(self, event):
        """Dessine le fond et les barres du visualiseur."""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        
        # Dessine le fond semi-transparent
        painter.fillRect(self.rect(), QColor(0, 0, 0, 180)) # Noir, 70% d'opacité

        if self.current_mode == "recording":
            # Dessine les barres du visualiseur
            for i, level in enumerate(self.audio_levels):
                x = i * self.bar_width
                bar_height = int(level * self.height() * 0.8)
                y = self.height() - bar_height

                gradient = QLinearGradient(x, y, x, self.height())
                gradient.setColorAt(0.0, QColor(0, 255, 0))
                gradient.setColorAt(0.5, QColor(255, 255, 0))
                gradient.setColorAt(1.0, QColor(255, 0, 0))
                painter.setBrush(gradient)
                painter.setPen(Qt.NoPen)

                painter.drawRect(int(x), int(y), int(self.bar_width * 0.8), bar_height)

    # --- Fonctions pour rendre la fenêtre déplaçable ---
    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.drag_position = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
            event.accept()

    def mouseMoveEvent(self, event):
        if event.buttons() == Qt.MouseButton.LeftButton and self.drag_position:
            self.move(event.globalPosition().toPoint() - self.drag_position)
            event.accept()

    def mouseReleaseEvent(self, event):
        self.drag_position = None
        event.accept()

    # --- Gestionnaire d'événements personnalisés ---
    def customEvent(self, event):
        if event.type() == CustomEvent.EVENT_TYPE:
            if event.event_name == "update_visualizer":
                self.update_visualizer(event.data)
            elif event.event_name == "show_recording":
                self.showNormal() # Utilise showNormal pour s'assurer qu'elle n'est pas minimisée
                self.raise_() # Force la fenêtre au premier plan
                self.activateWindow() # Active la fenêtre
                self.setFocus() # Tente de donner le focus à la fenêtre
                self.set_mode("recording")
            elif event.event_name == "hide_processing":
                self.set_mode("processing")
                self.hide()
            elif event.event_name == "success":
                self.show_status("success")
            elif event.event_name == "error":
                self.show_status("error")
            elif event.event_name == "close_window":
                self.close()

# --- Pour tester ce fichier seul ---
if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = VisualizerWindow()
    window.show()

    # Simule des données audio pour le test
    timer = QTimer()
    timer.timeout.connect(lambda: window.update_visualizer(np.random.rand()))
    timer.start(50) # Met à jour toutes les 50ms

    sys.exit(app.exec())