
import sys
import logging
from PySide6.QtWidgets import QApplication, QMainWindow, QLabel

# Configuration du logging pour voir les erreurs potentielles
logging.basicConfig(level=logging.INFO)

logging.info("Démarrage du test GUI minimal...")

try:
    # 1. Créer l'application
    app = QApplication(sys.argv)
    logging.info("QApplication créée.")

    # 2. Créer une fenêtre principale standard (QMainWindow)
    window = QMainWindow()
    logging.info("QMainWindow créée.")

    # 3. Définir quelques propriétés de base
    window.setWindowTitle("Test PySide6 de Base")
    window.resize(400, 200)
    
    # 4. Ajouter un simple texte à l'intérieur
    label = QLabel("Si vous voyez cette fenêtre, PySide6 fonctionne.", window)
    label.adjustSize()
    window.setCentralWidget(label)

    # 5. Afficher la fenêtre
    logging.info("Appel de window.show()...")
    window.show()

    # 6. Lancer la boucle de l'application
    logging.info("Lancement de app.exec()...")
    sys.exit(app.exec())

except Exception as e:
    logging.critical(f"Une erreur critique est survenue lors de l'initialisation de PySide6: {e}")
    # Garde la console ouverte pour voir l'erreur
    input("Appuyez sur Entrée pour quitter...")

