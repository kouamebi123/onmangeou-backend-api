# Audit ciblé frontend / backend — 2 septembre 2026

## Périmètre et méthode

Lecture des contrats HTTP, DTO, services et consommateurs des quatre frontends.
Il s'agit d'un audit statique ciblé, pas d'une recette complète ni d'une certification
d'absence de défaut. Aucune transaction, commande ni réservation de production
n'a été créée pour cet audit.

Références de départ :
- Backend : f9c32fd64c82d87c3c8e2180d3c43ced6db622e7.
- Client mobile : 5e831b699b9991c069649317093a3896b1477dd7.
- Restaurant mobile : 12dab3fcfe75f3632e24d37d522f5ea67901a442.
- Web public et administration : branches main récupérées pour inspection.

## Correctifs de réservation et d'avis livrés ensemble

- POST /reservations et POST /reviews : envoi de la clé Idempotency-Key exigée.
  La clé est conservée lors d'une nouvelle tentative du même formulaire.
- Date de réservation : conversion explicite depuis le fuseau du restaurant.
  Le backend expose timezone ; les écrans affichent date, heure et statut.
- Une réservation n'est pas une confirmation de disponibilité : les créneaux
  proposés sont des heures de demande, pas un inventaire des tables libres.
- Statuts : REQUESTED → CONFIRMED ou REJECTED ; CONFIRMED → SEATED, CANCELLED
  ou NO_SHOW ; SEATED → COMPLETED. Les statuts terminaux ne se rouvrent pas.
  Les mises à jour concurrentes sont contrôlées par le backend.
- Avis : propriétaire de la commande uniquement, commande COMPLETED obligatoire,
  choix 1–5, un avis par commande et modification de l'avis existant.
  Modifier un avis masqué ne le republie pas.
- GET /orders/:id/review : retourne uniquement l'avis du client connecté.
- Badge verified calculé à partir d'une commande terminée appartenant à l'auteur.

## Écarts restants — prioritaires

### P1 — Paiement simulé bloqué par le contrat d'idempotence

Client : src/api/commerce.ts, createPaymentIntent, n'envoie pas Idempotency-Key.
Backend : CommerceController.createIntent porte @Idempotent.
Conséquence : rejet avant la création de l'intention, même en simulation.
Prévoir une clé stable par tentative et des tests de répétition/expiration.

### P1 — Livraison et commande non synchronisées

Restaurant : ServicePanel permet ASSIGNED → DELIVERED directement.
Backend : CommerceService.changeDelivery ne met à jour que delivery_tasks ;
OrdersService.confirmPickup n'examine que READY, sans distinguer le service.
Conséquences : livraison terminée avec commande non terminée, ou confirmation
de retrait proposée pour une livraison. L'éligibilité à l'avis dépend alors d'un
statut de commande qui ne reflète pas nécessairement la réception.
Définir les transitions par mode de service et les appliquer atomiquement.

### P1 — Permissions de lecture utilisées pour des mutations d'administration

MerchantOpsController protège remboursement sandbox, masquage d'avis et clôture
de ticket par ADMIN_ESTABLISHMENT_READ. Les routes et charges utiles du back-office
existent, mais la séparation lecture / écriture n'est pas assez explicite.
Définir les droits dédiés, la matrice de rôles et la traçabilité de ces décisions.

### P2 — Gestion des avis du commerçant incomplète

ServicePanel réutilise une seule variable reply pour toutes les réponses.
Plusieurs actions utilisent .then(refresh) sans état d'erreur visible.
Prévoir une réponse et une mutation par avis, avec confirmation et erreur.
Photos d'avis, signalement et notation séparée du livreur ne sont pas livrés.

### P2 — Réservations : gestion de capacité non implémentée

Pas de contrôle de tables libres ni de durée d'occupation dans createReservation.
L'interface explicite donc qu'il s'agit d'une demande à confirmer.
La liste commerçant est limitée à 80 entrées triées par date croissante :
à terme, ajouter filtres actifs/date et pagination pour ne pas masquer les suivantes.

## Cohérences constatées dans les parties inspectées

- Web public : découverte, fiche par slug, avis et événements utilisent des routes
  existantes, avec enveloppe data/meta et paramètres de découverte reconnus.
- Administration : les consommateurs des listes commandes, avis et tickets
  utilisent les noms snake_case renvoyés par les services concernés.
- Les clients utilisent le préfixe /api/v1 et le format d'erreur applicatif.
- Ces constats ne couvrent pas tous les écrans, rôles ni combinaisons de modules.

## Vérifications et limites

- Client : 19 tests unitaires réussis, dont les tests de fuseau et dates invalides.
- 8 assertions directes réussies sur les transitions de réservation.
- ESLint ciblé client et restaurant : réussi.
- Typecheck complet local non validé : les dépendances locales disponibles sont
  SDK 57 / React Native 0.86, alors que les dépôts ciblent SDK 54. Deux usages
  préexistants d'absoluteFillObject échouent avec ces types locaux.
- Pas de test HTTP authentifié contre PostgreSQL, ni de recette sur téléphone,
  ni de validation du déploiement Railway ou d'une publication EAS.

## Ordre de recette

Déployer le backend avant les nouvelles applications (nouveau GET d'avis).
Tester réservation connecté/déconnecté, double clic, répétition après perte réseau,
date passée, Abidjan/Paris, confirmation/refus, annulation concurrente.
Tester avis avant/après commande terminée, autre utilisateur, modification,
avis masqué et score hors plage. Vérifier chaque rôle restaurant/admin.
Terminer la synchronisation livraison/commande avant de considérer les avis
de livraison comme entièrement conformes au parcours attendu.
