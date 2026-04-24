# Runbook — réponse à incident de sécurité

## Portée

Tout événement pouvant compromettre la confidentialité, l'intégrité ou la disponibilité des données utilisateurs : fuite, accès non autorisé, ransomware, perte de données, compte ops compromis.

## Rôles

Dev solo → un seul opérateur, **qui prend toutes les décisions**. En cas d'incapacité temporaire (maladie, indisponibilité), le projet reste offline jusqu'au retour — accepté consciemment (cf. threat model acteur D).

## Horloge GDPR

Depuis la **prise de connaissance** de la fuite (détection, alerte, signalement tiers) :

- **T+0** : détection / alerte
- **T+24h** : premier diagnostic terminé, décision de gravité prise
- **T+48h** : mitigation déployée OU décision de coupure service
- **T+72h** : **notification CNIL obligatoire** si fuite confirmée impactant des données perso
- **T+72h à T+... (selon gravité)** : notification aux users impactés (obligatoire si "risque élevé pour les droits et libertés")

## Procédure

### Phase 1 — Détection et contention (T+0 à T+4h)

1. Noter l'heure exacte de détection dans ce runbook (section historique)
2. Identifier la surface impactée : auth, DB, edge function, CI, compte ops, release updater
3. Si compte ops compromis : changer immédiatement le mot de passe, révoquer les sessions, activer 2FA si ce n'était pas fait
4. Si DB compromise (accès non autorisé confirmé) : isoler — passer le projet Supabase en mode maintenance ou bloquer l'IP suspecte via `policies`
5. Si release updater compromise (ex: clé privée fuitée) : retirer les dernières releases du feed public, exécuter §4 du runbook `secrets-rotation.md`
6. Geler les déploiements (pas de `git push --tags` pendant l'investigation)

### Phase 2 — Diagnostic (T+4h à T+24h)

1. Quelle donnée a été exposée ? (emails, notes, settings, sessions…)
2. Combien d'utilisateurs impactés ?
3. Depuis quand ?
4. L'attaquant a-t-il modifié des données (intégrité) ?
5. Constituer un dossier : logs Supabase, logs GitHub Actions, screenshots, timeline
6. Si fuite **avérée** impactant données perso → passer en Phase 3. Si faux positif → documenter et clôturer.

### Phase 3 — Notification (T+24h à T+72h)

1. **CNIL** : notifier via https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles avant T+72h
   - Nature de la violation
   - Catégories et nombre approximatif de personnes concernées
   - Conséquences probables
   - Mesures prises ou envisagées
2. **Users impactés** : email individuel si "risque élevé" (fuite de hashes password, notes complètes en clair, etc.)
   - Template FR/EN à préparer à l'avance (section "Templates" ci-dessous)
3. **Site marketing / statut** : page publique sobre avec timeline et mesures prises

### Phase 4 — Remédiation et post-mortem (T+72h et après)

1. Déployer le fix définitif (pas juste la contention)
2. Post-mortem écrit dans `docs/v3/incidents/YYYY-MM-DD-<slug>.md` (créer le dossier à cette occasion) : timeline, cause racine, ce qui a bien marché, ce qui a mal marché, actions correctives
3. Mettre à jour le threat model si un nouveau vecteur est découvert
4. Si la cause racine est un actif/acteur hors-scope du threat model initial : reclassification et révision ADR 0006

## Templates

### Template email user impacté (FR)

````
Sujet : Voice Tool — incident de sécurité vous concernant

Bonjour,

Le <date>, nous avons découvert que <nature de l'incident>. Vos données suivantes ont été exposées : <liste>.

Nous avons pris les mesures suivantes : <liste>.

Vous pouvez protéger votre compte en :
1. Changeant votre mot de passe (lien : <url>)
2. Activant le 2FA dans les paramètres
3. Vérifiant la liste des appareils connectés

Nous avons notifié la CNIL conformément au GDPR. Pour toute question : security@voice-tool.app.

Nos excuses sincères.

L'équipe Voice Tool
````

### Template email user impacté (EN)

(Traduction miroir à préparer.)

## Contacts utiles

- **CNIL** : https://www.cnil.fr/ — notification en ligne
- **Supabase support** : https://supabase.com/support (gratuit Pro, payant Enterprise)
- **GitHub security** : https://github.com/contact (report-a-user si compromission GitHub)

## Historique d'incidents

Aucun à ce jour.

| Date détection | Slug | Gravité | Post-mortem |
|---|---|---|---|
| — | — | — | — |
