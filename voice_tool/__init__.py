"""Voice Tool package.

Ce package regroupe la logique de l'application en modules séparés:
- config_manager: chargement .env, constantes globales et config système
- paths: chemins AppData et fichiers utilisateurs
- history: gestion de l'historique des transcriptions
- settings: préférences utilisateur
- sounds: génération et lecture des sons d'UI
- lock: mécanisme d'instance unique et monitoring de commandes
- transcription: providers (Google, OpenAI)
"""

__all__ = [
    "config_manager",
    "paths",
    "history",
    "settings",
    "sounds",
    "lock",
    "transcription",
]


