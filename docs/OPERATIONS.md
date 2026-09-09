# Exploitation et recette de lancement

## Périmètre

Les paiements réels restent reportés. La présence de moyens de paiement de
simulation ne constitue pas un encaissement. Ne pas désactiver les contrôles
`APP_ENV=production` pour faire passer une configuration incomplète.

## Surveillance

`API_BASE_URL` (origine API) puis `node scripts/operations.mjs check` vérifie
les sondes live/ready. Avec `ADMIN_ACCESS_TOKEN` fourni par un coffre de secrets,
le contrôle vérifie également les files via `/api/v1/admin/operations` et échoue
si des tâches ont plus de 15 minutes de retard. Le jeton n'est jamais affiché.
Exécuter toutes les minutes depuis le superviseur choisi et alerter l'équipe
sur échec. Le script ne transmet aucun message à un tiers et aucun superviseur
externe n'est provisionné par ce dépôt. Les statuts et nombres agrégés restent
réservés aux comptes internes autorisés.

## Sauvegarde et restauration

Prérequis : outils PostgreSQL de même version majeure que le serveur, `tar`,
stockage protégé et API/workers en maintenance pendant la copie cohérente.

- Définir `DATABASE_URL`, `MEDIA_LOCAL_ROOT`, `BACKUP_DIR` (nouveau répertoire)
  et `WRITES_PAUSED=true` uniquement après suspension effective des écritures.
- Exécuter `node scripts/operations.mjs backup`. En cas d'échec, le répertoire
  partiel reste présent pour diagnostic ; choisir un autre chemin au prochain essai.
- Copier/chiffrer la sauvegarde dans un emplacement distinct, selon la politique
  de conservation choisie, puis reprendre les écritures.
- Créer une base vide dédiée suffixée `_restore_test`, définir
  `RESTORE_DATABASE_URL`, `RESTORE_CONFIRM` (son nom exact) et `BACKUP_DIR`.
- Exécuter `node scripts/operations.mjs restore-check`. Aucun `DROP` ni `--clean`
  n'est utilisé. Le script vérifie les empreintes, restaure la base et liste l'archive.
- Extraire les médias dans un répertoire neuf d'une API de recette isolée, puis
  vérifier visuellement photos, commandes et réservations. Ne pas brancher les
  fournisseurs SMS/push de production à cette restauration.

Une archive produite ne prouve pas que la restauration a été testée. Inscrire la
date, le responsable et le résultat de chaque exercice dans le registre d'exploitation.

## Déploiement et retour arrière

1. Sauvegarde contrôlée, puis migrations additives du 8 septembre 2026.
2. Backend et test des nouvelles routes avant les frontends.
3. Reconstruire les binaires natifs (SQLite ajouté au restaurant). Une OTA ne
   peut pas ajouter ce module à un ancien binaire ; utiliser le runtime fingerprint.
4. Contrôler les sondes et les parcours ci-dessous avant de généraliser la version.
5. En cas d'incident, suspendre la diffusion des nouveaux binaires/OTA et rétablir
   l'image applicative précédente compatible avec les migrations additives.
   Ne pas annuler les migrations ou restaurer une ancienne base sur des données
   nouvelles sans procédure de reprise étudiée.

## Matrice de recette sur appareils

- Deux comptes restaurant affectés à des établissements différents : aucune
  lecture/écriture croisée ; module désactivé invisible et refusé par l'API.
- Commande espèces, réception restaurant, préparation, retrait ; livraison avec
  transitions successives et fin uniquement après livraison.
- Deux demandes de réservation simultanées sur la même table, capacité trop petite,
  deux créneaux adjacents, annulation, arrivée, historique paginé.
- Mode avion après synchronisation initiale : fermer/relancer l'application,
  consulter le catalogue et enregistrer dépense, disponibilité, commande de salle.
  Reconnecter ; vérifier une seule écriture par action. Changer un prix sur un autre
  terminal avant reprise : conflit visible et aucun montant accepté silencieusement.
- Avis après commande terminée ; note livreur uniquement après livraison ; trois
  photos, refus d'une quatrième ; signalement et masquage avec disparition publique.
- Campagne proposée, approbation admin, affichage Sponsorisé, clic ; vérifier compteurs,
  expiration et suspension ; SUPPORT ne peut pas approuver.
- Push sur les deux nouveaux binaires : réception, clic, désactivation et déconnexion.
  Vérifier les reçus Expo. Expo Go et le web ne valident pas les push natifs.
- SMS Twilio sur numéro contrôlé, code de développement désactivé ; carte Android
  avec clé restreinte à la signature du binaire, puis équivalent iOS.

## Configurations externes à vérifier

Credentials FCM v1/APNs, GOOGLE_SERVICES_JSON distinct par application,
GOOGLE_MAPS_ANDROID_API_KEY, EXPO_TOKEN, signature Apple/Android, activation
PUSH_ENABLED et credentials Twilio. Les secrets restent côté coffre/serveur.
La soumission App Store/Google Play et les paramètres de domaine/support/conservation
nécessitent les informations et accès du propriétaire ; ils ne sont pas inventés.

## Exercice local du 9 septembre 2026

Réalisé sur PostgreSQL 18/PostGIS local après arrêt des tests écrivains : sauvegarde
custom de `onmangeou_test`, empreintes SHA-256 et archive d'un fichier média fictif.
Restauration réussie dans la nouvelle base `onmangeou_20260909_restore_test`,
contrôle SQL des tables utilisateurs/établissements/commandes et lecture de l'archive.
Les fichiers de l'exercice sont dans `/tmp/onmangeou-backup-20260909` ; ce répertoire
temporaire ne constitue pas un stockage de sauvegarde durable. Aucune base de
production n'a été utilisée. La recette des images réelles après extraction sur
une API isolée et l'automatisation externe restent à effectuer.

Expo/EAS : connexion et accès aux deux projets confirmés. Le propriétaire indique
que les autres fournisseurs ne sont pas encore configurés. Aucun build signé ni
publication distante n'a été effectué pendant cette finalisation.
