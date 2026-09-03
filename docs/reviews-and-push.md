# Photos d’avis, signalements et notifications push

## Avis

Les règles existantes d’avis après une commande éligible restent inchangées.
Après publication, son auteur peut ajouter ou supprimer jusqu’à trois photos.
JPEG, PNG et WebP sont acceptés, avec une limite de 8 Mo et de 25 millions de pixels.
Le serveur réencode en WebP (1 600 px maximum) et retire les métadonnées EXIF/GPS.
La clé du stockage reste privée dans la réponse API ; les photos publiques passent
par une route qui vérifie que l’avis est toujours publié. Le stockage réutilise
l’adaptateur MediaStorage et le volume existant, pas un chemin codé dans les applications.
Les fichiers persistants doivent être sauvegardés avec la base.

Routes sous /api/v1 :

| Méthode / route | Accès |
| --- | --- |
| POST /reviews/:reviewId/photos/:photoId | Auteur ; multipart image ; UUID photo stable pour les reprises |
| DELETE /reviews/:reviewId/photos/:photoId | Auteur |
| GET /reviews/:reviewId/photos/:photoId/file | Public, uniquement si avis publié |
| POST /reviews/:id/report | Connecté ; pas son propre avis ; un signalement par auteur et avis |
| GET /admin/review-reports | admin.establishment.read |
| POST /admin/review-reports/:id/resolve | admin.review.moderate |

Motifs : SPAM, ABUSE, PRIVACY, MISLEADING, OTHER ; précisions facultatives (1 000 caractères).
La page Avis du back-office présente les 100 signalements ouverts les plus anciens.
Une décision motivée peut classer sans suite (DISMISSED) ou masquer l’avis (ACTIONED).
L’action est journalisée dans la même transaction. Signaler ne masque jamais automatiquement.

## Distribution push

1. Appliquer la migration 20260903010000_review_media_push avec le déploiement habituel.
2. Configurer les identifiants de distribution FCM v1 / APNs des deux projets EAS :
   client b99b0cce-bdc3-4628-9513-2f4cb79fd65e ;
   restaurant 88a9ebeb-d938-4fb8-b688-cc09d506f326.
   Pour Android, fournir aussi le fichier Firebase client via la variable fichier
   GOOGLE_SERVICES_JSON de chaque projet EAS, distincte de la clé serveur FCM v1.
3. Reconstruire et installer chaque application native : ajout d’expo-notifications,
   donc une mise à jour OTA seule ne suffit pas. SDK 54 est conservé.
   Les builds EAS utilisent ONMANGEOU_NATIVE_RUNTIME=1 et une empreinte de compatibilité.
   Les mises à jour natives utilisent pnpm update:native:preview ; les commandes
   Expo Go existantes restent séparées sur la politique sdkVersion.
4. Activer PUSH_ENABLED=true sur le service API Railway, puis le redéployer.
   Si la sécurité renforcée Expo Push est activée, fournir EXPO_PUSH_ACCESS_TOKEN
   côté serveur uniquement. Ne jamais mettre ce secret dans EXPO_PUBLIC_*.
5. Se connecter sur un téléphone, ouvrir les réglages Notifications du profil/menu,
   activer les notifications et accepter l’autorisation système.

POST /me/push-subscription inscrit le jeton Expo de l’installation authentifiée :
{application: CLIENT ou MERCHANT, token}. DELETE désactive cet appareil.
Le compte restaurant doit disposer d’orders.read. Les envois sont limités aux membres
actifs affectés à l’établissement concerné ; session, affectation et permission sont
revérifiées au moment de l’envoi. Les changements de compte et les désactivations
invalident les inscriptions mobiles encore en cours.

Les créations/changements de statut de commandes et réservations créent leurs
notifications et leur file push dans la même transaction PostgreSQL.
Une commande en attente de paiement n’alerte pas encore le restaurant.
Aucun rattrapage d’anciennes notifications n’est effectué.
Le dernier consentement marketing s’applique aux notifications EVENT/PROMOTION/MARKETING,
à la mise en file puis à l’envoi. Cette version n’ajoute pas un outil de campagne.

Le processeur tourne dans le service API toutes les cinq secondes quand PUSH_ENABLED
est vrai : prise atomique des tâches, bail de reprise, tentatives espacées, expiration
des messages après 24 heures et contrôle des reçus Expo après environ 15 minutes.
Ne pas activer la mise en veille du service si une distribution continue est souhaitée.
Le texte affiché sur l’écran verrouillé est générique ; aucun détail de commande n’y figure.
Le clic ouvre le suivi/l’espace concerné et invalide les listes mises en cache.

PENDING → PROCESSING → CHECKING (ticket Expo) → DELIVERED (reçu fournisseur).
Les autres issues sont FAILED ou CANCELLED. DELIVERED ne prouve ni lecture ni affichage
sur le téléphone. La livraison est au moins une fois : une réponse réseau perdue peut
occasionner un doublon. DeviceNotRegistered désactive uniquement le jeton effectivement
utilisé, pas un jeton renouvelé depuis l’envoi.

Contrôle opérationnel, en lecture seule :

```sql
SELECT status, error_code, count(*) FROM push_deliveries
GROUP BY status, error_code ORDER BY status, error_code;
```

PUSH_ENABLED=false est la valeur par défaut : le code n’envoie rien tant que
l’activation serveur n’est pas faite. Les cartes mobiles attestent l’inscription,
pas la disponibilité d’APNs/FCM. Sur le web et dans Expo Go, la fonction push est
explicitement désactivée ; le reste de l’application reste testable.

## Recette sur appareils réels

- Installer les deux nouvelles versions, accepter les notifications.
- Créer une commande ou réservation avec le client ; vérifier la réception restaurant.
- Modifier son statut côté restaurant ; vérifier la réception client et le clic.
- Désactiver, se déconnecter ou retirer l’accès restaurant ; vérifier l’absence
  d’envoi pour les événements suivants.
- Vérifier les reçus en base après leur délai de disponibilité.
- Publier un avis, ajouter trois photos, vérifier le refus de la quatrième.
- Signaler l’avis depuis un autre compte, traiter dans le back-office et vérifier
  la disparition de l’avis et de ses photos publiques après masquage.

Les tests automatisés simulent Expo : ils ne remplacent pas cette recette.
Les tests SQL utilisent PostgreSQL en mémoire (PGlite) et la vraie migration ;
les tests d’intégration PostgreSQL/PostGIS complets restent exécutés en CI.
