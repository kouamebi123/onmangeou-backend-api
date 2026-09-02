# Réservations et fiabilité — lot du 3 septembre 2026

## Correctifs

- Confirmation restaurant : paramètres `timestamptz` explicites pour supprimer
  l'erreur PostgreSQL 42883 (`timestamp with time zone < interval`). Les verrous
  et règles de capacité/chevauchement restent en place.
- Les validations temporelles des réservations utilisent l'horloge injectée.
- Applications : un échec réseau/500 du renouvellement de session ne déconnecte
  plus l'utilisateur. Un renouvellement tardif ne restaure pas un ancien compte.
- Les nouvelles tentatives HTTP après renouvellement conservent l'idempotency key.
- Délai d'attente réseau, explications de validation, erreurs et attente visibles
  sur les actions profil/établissement/tables ; upload web avec un vrai Blob.
- « Dès que possible » reste indisponible selon les horaires serveur : le client
  explique pourquoi et montre le prochain créneau. Aucun contournement des horaires.

## Historique restaurant

`GET /api/v1/merchant/reservations/history?establishmentId=<uuid>&cursor=<opaque>`

Permission `orders.read`, module réservations actif, établissement autorisé.
Vingt entrées par page, statuts COMPLETED/CANCELLED/REJECTED/NO_SHOW,
tri `starts_at DESC, id DESC`, curseur dans `meta.nextCursor`, résultats dans `data`.
Pas de modification du contrat existant `/merchant/reservations` (activité).
L'interface propose « À gérer » / « Historique », rafraîchissement et chargement
progressif. Les cartes conservent les couleurs et composants du design existant.
Déployer le backend avant d'utiliser ce nouvel onglet. Aucune migration requise.

## Vérifications locales

- Backend : TypeScript, ESLint, Prettier, 176 tests unitaires, build et bundle API.
- Client : TypeScript, ESLint, 27 tests, export Expo iOS/Android/web.
- Restaurant : TypeScript, ESLint, 17 tests, export Expo iOS/Android/web.
- Cinq scénarios SQL exécutés sur PostgreSQL embarqué PGlite : allocation,
  chevauchement, frontière de deux heures, table occupée et capacité insuffisante.
- Quatre régressions SQL permanentes ajoutées à la suite d'intégration PostgreSQL
  (tables temporaires). Leur exécution avec PostGIS/Redis dépend de la CI dédiée.
- Aucune réservation/commande de test écrite en production ; pas de recette
  visuelle sur téléphone, ni garantie d'absence totale de bugs.

## Écarts encore identifiés, hors de ce lot

Cette liste n'est pas un certificat exhaustif de conformité à la spécification.

1. Avis : photos et signalement ne sont pas exposés par le parcours actuel.
2. Push : l'identité stocke un jeton, mais le worker actuel journalise les événements
   puis les marque traités, sans livraison push ; inscription mobile, dispatch,
   accusés et reprises doivent être reliés avant de déclarer ce canal opérationnel.
3. Hors connexion : cache/panier ne constituent pas une outbox SQLite avec
   synchronisation et résolution des conflits des écritures restaurant.
4. Médias : validation signature/taille et stockage abstrait existent ; suppression
   EXIF, miniatures serveur et quotas restent à compléter.
5. Publicité : pas de chaîne complète campagne/diffusion/mesure dans les dépôts
   audités ; ne pas confondre événements/promotions et régie publicitaire.

Paiements réels volontairement exclus ; fournisseur SMS existant non modifié.
Les extensions seront des tranches séparées, avec tests et configuration explicite,
sans inventer de tarifs, de partenaires ni activer des dépenses externes.
