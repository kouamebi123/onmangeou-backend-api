# Travaux de finalisation — 9 septembre 2026

Périmètre demandé : finaliser le projet, paiements réels reportés.
Les cases ci-dessous distinguent le travail vérifié localement de la mise en service.

## Réalisé et vérifié

- [x] Node 24 et dépendances des cinq dépôts ; lint, TypeScript et tests.
- [x] Compilation backend et builds de production du site et du back-office.
- [x] Exports Expo iOS, Android et web des deux applications.
- [x] Hors connexion restaurant : file persistante SQLite, cache, reprise avec clé
  stable, séparation des sessions/organisations et conflits visibles.
- [x] Dépenses rejouables sans doublon, commandes de salle avec contrôle du prix
  au retour du réseau, disponibilité protégée contre les changements obsolètes.
- [x] Nouvelles images avatar/couverture/produit : EXIF retiré, WebP redimensionné,
  miniature, quota utilisateur/établissement et nettoyage lors des remplacements.
- [x] Note de livraison distincte de la note du restaurant, réservée aux livraisons terminées.
- [x] Campagnes proposées par le restaurant, modérées dans le back-office,
  diffusées sur site/application client ; impressions et clics dédupliqués par vue.
- [x] Recette automatisée sur PostgreSQL 18/PostGIS et Redis locaux.
- [x] Contrat OpenAPI régénéré avec les schémas des campagnes.
- [x] Connexion Expo/EAS et rattachement des deux projets vérifiés en lecture seule.
- [x] Scripts de contrôle de santé, surveillance des files, sauvegarde et restauration.
- [x] Procédure de recette sur appareils et de retour arrière documentée.

## Résultats de vérification

- Backend : 209 tests unitaires ; suite complète initiale de 37 tests d'intégration
  réussie (dont 3 nouveaux parcours), puis 4/4 tests de finalisation réussis après
  ajout du contrôle de supervision : 38 scénarios validés au total.
- Restaurant : 31 tests ; client : 34 tests ; back-office : 9 tests ; site : 5 tests.
- Les exports Expo vérifient la compilation JavaScript et les ressources ; ils
  ne remplacent pas un build signé ni un essai sur téléphone.
- Les migrations additives ont été appliquées uniquement à la base de test.
- Sauvegarde et restauration SQL réussies le 9 septembre sur une base isolée,
  avec vérification SHA-256 et lecture de l’archive contenant un média fictif.
  La restauration visuelle des photos réelles reste à effectuer avant lancement.

## Mise en service restante

Vous avez confirmé que seul Expo/EAS est configuré. Les points suivants restent ouverts :

- [ ] Configurer la signature Android et le compte Apple/signature iOS.
- [ ] Configurer Firebase/FCM et APNs, puis vérifier réception et ouverture des push.
- [ ] Configurer les clés Google Maps restreintes aux applications et signatures.
- [ ] Configurer Twilio/SMS, désactiver l'écho OTP en production et tester un envoi réel.
- [ ] Produire les nouveaux binaires EAS, les installer et exécuter la recette physique.
- [ ] Déployer les migrations/backend puis les interfaces et vérifier les parcours distants.
- [ ] Activer un superviseur externe, la planification des sauvegardes et leur copie
  chiffrée hors serveur ; réaliser une restauration avec médias réels sur une API isolée.
- [ ] Soumettre les applications aux boutiques après validation de la recette.

Aucun build EAS payant, aucune soumission et aucun déploiement n'ont été lancés.
Les secrets doivent être configurés dans les coffres/services concernés, jamais dans le chat.

## Limites connues à traiter selon les données existantes

- Les anciens médias ne sont pas retraités rétroactivement et ne sont pas comptés
  dans `media_assets` avant remplacement. Les photos d'avis conservent leur filière
  existante (limite par avis) ; elles ne partagent pas le nouveau quota des avatars.
  Un inventaire des médias du serveur est nécessaire avant de revendiquer un quota global.
- Les actions hors connexion de plus de 23 heures nécessitent une décision humaine
  pour éviter un rejeu au-delà de la durée de conservation des clés d'idempotence.
  La déconnexion efface les données locales de la session : synchroniser avant de sortir.
- Les compteurs publicitaires mesurent les événements par vue, pas une audience unique
  certifiée ; aucune facturation publicitaire ni paiement opérateur n'est activé.

Procédure détaillée : [exploitation et recette](OPERATIONS.md).
