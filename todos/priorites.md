## Priorités à venir

- **Redémarrage du micro à chaud**
  - **But**: quand l’utilisateur change le microphone dans Paramètres, le stream audio persistant est redémarré proprement avec le nouveau périphérique (sans relancer l’application).
  - **Détails**:
    - Ajouter une fonction `_restart_audio_stream(new_device_index)` qui stoppe et recrée l’`InputStream` persistant en sécurité (verrous, try/except, logs, re‑sanitisation de l’index).
    - Déclencher ce restart dès que `input_device_index` change via l’UI (après sauvegarde des préférences).
  - **Critères d’acceptation**: changement de micro effectif immédiatement; pas de coupure/crash; logs explicites.

- **Lien transcription ↔ fichier audio**
  - **But**: associer chaque item d’historique à son WAV et permettre des actions.
  - **Détails**:
    - Stocker `audio_path` dans l’item d’historique (clé déjà supportée côté modèle).
    - UI Historique: ajouter actions par item: "▶️ Écouter", "📂 Ouvrir dossier", "🗑️ Supprimer (texte + audio)".
    - Si le fichier n’existe plus (rétention/purge): afficher un message clair et proposer d’ouvrir le dossier.
  - **Critères d’acceptation**: écoute et ouverture fonctionnelles; suppression par item supprime aussi le WAV.

- **Rétention des enregistrements (déjà en place)**
  - **But**: éviter l’accumulation des WAV.
  - **Détails**:
    - Paramètre `recordings_keep_last` (par défaut 25) déjà ajouté; purge automatique après chaque enregistrement.
    - Ajouter un bouton "Nettoyer maintenant" dans Paramètres pour lancer la purge manuelle.
    - Tolérance UI: si un item pointe vers un audio purgé, afficher une info non bloquante.
  - **Critères d’acceptation**: toujours ≤ N fichiers WAV après enregistrement; bouton de purge fonctionne.

- **Réglage du niveau de logs**
  - **But**: limiter la taille de `voice_tool.log` en mode normal.
  - **Détails**:
    - Paramètre UI: "Niveau de logs" = {INFO (défaut), DEBUG}.
    - Appliquer dynamiquement au logger racine et au handler fichier.
  - **Critères d’acceptation**: bascule instantanée du niveau; persistance en préférences; rotation inchangée.

## Notes techniques

- Le stream audio est persistant; le restart devra être atomique et sérialisé (éviter concurrence avec `toggle_recording`).
- L’UI Historique travaille sur une vue filtrée: les actions par item doivent s’appuyer sur l’objet source (pas seulement le texte affiché).
- La purge de rétention se base sur l’ordre par mtime; conserver strictement les N plus récents.


