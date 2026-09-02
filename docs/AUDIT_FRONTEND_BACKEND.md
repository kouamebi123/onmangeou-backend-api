# Audit ciblé frontend / backend — correctifs du 2 septembre 2026

## Périmètre

Contrats HTTP, DTO, services et consommateurs des quatre frontends.
Ce document décrit les écarts identifiés et les correctifs apportés ; il ne
certifie pas l'absence de tout défaut. Aucune donnée de production n'a été
modifiée pendant ces vérifications.

## Correctifs livrés

### Paiement simulé

Le client envoie Idempotency-Key et conserve la clé pour une nouvelle tentative
du même paiement. Il réutilise l'intention si la confirmation échoue.
La confirmation verrouille commande et intention dans une transaction :
seule une commande PENDING_PAYMENT peut être payée, un paiement remboursé ne
peut pas être réactivé, et une confirmation déjà réussie ne produit plus d'écriture.
Les transactions réelles restent hors périmètre.

### Livraison et commande

UNASSIGNED → ASSIGNED → PICKED_UP → DELIVERING → DELIVERED.
L'affectation nécessite une commande acceptée ; le retrait et les étapes
suivantes nécessitent READY. Le backend fournit allowedActions à l'interface.
DELIVERED termine la commande dans la même transaction.
Une livraison ne peut pas être terminée via le bouton de retrait client ou
le bouton de fin de commande du restaurant. Annuler/refuser une commande
annule aussi sa tâche de livraison.

### Administration

Permissions distinctes : admin.payment.refund, admin.review.moderate et
admin.support.write. ADMIN les possède ; SUPPORT reste en lecture seule.
GET /admin/capabilities pilote l'affichage des actions ; les routes serveur
contrôlent toujours les permissions. Le remboursement exige une
réauthentification récente. Les mutations sont tracées dans le journal d'audit.
Les boutons affichent confirmation, attente et résultat ou erreur.

### Avis et réponses du restaurant

Avis réservé au propriétaire d'une commande COMPLETED, note 1–5,
un avis par commande et modification possible. Un avis masqué reste masqué.
GET /orders/:id/review permet au client de récupérer son propre avis.
Idempotency-Key est envoyé à la création.
Chaque avis commerçant a son champ de réponse et sa mutation indépendants,
avec validation, attente, confirmation et erreur visibles.

### Réservations

Le formulaire propose dates et heures, converties selon le fuseau du restaurant,
et conserve sa clé d'idempotence. Il s'agit d'une demande, pas d'une garantie
de table disponible avant validation du restaurant.

La confirmation attribue une table configurée dont la capacité est suffisante,
sans chevauchement de réservation confirmée ou occupée.
La durée conventionnelle affichée est de deux heures.
Un verrou sur l'établissement sérialise les allocations concurrentes.
Sans table adaptée, la confirmation est refusée avec une explication.
Les réservations historiques confirmées sans table sont traitées prudemment
comme un conflit sur leur créneau ; elles nécessitent une régularisation.

REQUESTED → CONFIRMED / REJECTED / CANCELLED ;
CONFIRMED → SEATED / CANCELLED / NO_SHOW ; SEATED → COMPLETED.
NO_SHOW est interdit avant l'heure prévue.
La liste opérationnelle présente les demandes, confirmations et clients installés ;
l'ancien plafond de 80 entrées mélangeant historique et activité est supprimé.
Une vue historique paginée reste une évolution distincte.

## Vérifications locales

- Backend : 123 tests unitaires réussis, vérification TypeScript et ESLint ciblé réussis.
- Client mobile : 19 tests réussis ; ESLint ciblé réussi.
- Restaurant mobile : 8 tests réussis ; ESLint ciblé réussi.
- Administration : 9 tests réussis ; TypeScript et ESLint ciblé réussis.
- Les tests de service utilisent des doublures : ils ne valident pas l'exécution
  du SQL ni une véritable concurrence PostgreSQL.
- Le contrôle TypeScript mobile complet reste limité par les dépendances locales
  disponibles (SDK 57 / React Native 0.86) alors que les dépôts restent SDK 54.
  Des usages préexistants d'absoluteFillObject échouent avec ces types locaux.
  Aucune montée de SDK n'a été effectuée.
- Pas de recette native sur téléphone, de publication EAS, ni de vérification
  du déploiement Railway dans cette passe.

## Déploiement et recette restante

Déployer le backend avant les frontends : nouveaux contrats capabilities,
allowedActions et attribution des tables. Configurer les tables et leurs capacités
avant de confirmer des réservations.

Tester sur une base dédiée : double confirmation simultanée pour une même table,
chevauchements et créneaux adjacents, groupes trop grands, arrivée tardive,
paiement répété ou annulé, parcours complet de livraison, compte SUPPORT et ADMIN,
session nécessitant une réauthentification et erreurs réseau.
Puis effectuer la recette sur téléphone avec les dépendances SDK 54.

Les photos d'avis, le signalement et une notation séparée du livreur ne sont
pas implémentés par ce lot. Le web public n'a pas nécessité de changement pour
les cinq écarts corrigés. Les autres modules ne sont pas certifiés par cet audit.
