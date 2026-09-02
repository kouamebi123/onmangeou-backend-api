# Coupons — contrat et recette

## Parcours livré

Le commerçant crée un code propre à son établissement, avec une remise en points de base (1000 = 10 %), un minimum de panier facultatif et une expiration facultative. Il peut désactiver ou réactiver le code. Les conditions ne sont pas modifiées après création : créer un nouveau code pour une autre offre. Les anciennes commandes conservent leurs montants.

Le client applique un seul code dans son panier. Le devis et la création de commande utilisent la même règle monétaire. Le serveur recalcule à partir des prix du catalogue : aucun montant fourni par le client ne fait foi. Les codes sont normalisés en majuscules (3–40 caractères A–Z, 0–9, tiret, underscore).

## API `/api/v1`

- `GET /merchant/coupons?establishmentId=<uuid>&offset=0` : tableau de 50 coupons au maximum, triés par création et identifiant décroissants. Champs : `id`, `code`, `discount_bps`, `active`, `expires_at` ISO/null, `minimum_amount` chaîne FCFA. Augmenter offset de 50 tant qu'une page contient 50 éléments.
- `POST /merchant/coupons`, avec `Idempotency-Key` : `{ establishmentId, code, discountBps, minimumAmount?: string, expiresAt?: ISO }`. Retour `{ id, code, discountBps }`.
- `POST /merchant/coupons/:id/status` : `{ active: boolean }`. Action à état explicite, pas une inversion aveugle.
- `POST /orders/quote` : ajout facultatif de `couponCode` au corps existant. Réponse : `lines`, `subtotal`, `discount`, `total`, `couponCode`, `currency`. Les montants sont des MoneyView `{ amount: string, currency: "XOF", formatted: string }`.
- `POST /orders` : ajout facultatif de `couponCode`, toujours avec `Idempotency-Key`. Les vues de commande ajoutent `subtotal`, `discount`, `couponCode`.

Toutes les réponses restent dans l'enveloppe API habituelle. Les routes commerçant exigent le périmètre établissement, la permission d'écriture et le module marketing. Un client ne peut utiliser un code d'un autre restaurant. Un code incorrect, désactivé, expiré ou ne respectant pas le minimum est refusé ; il n'est jamais retiré silencieusement.

## Règles monétaires et temporelles

- Calcul exclusivement en bigint FCFA ; arrondi half-up au FCFA.
- Minimum évalué sur le sous-total des plats avant remise.
- Validité évaluée au moment de commander, et non à la date du service programmé.
- Relecture et verrou partagé du coupon dans la transaction de commande : une désactivation concurrente attend la fin de cette transaction.
- Sous-total, remise, code et total sont enregistrés comme instantané sur la commande.
- Une commande à zéro ne crée pas de paiement en attente : mode CASH et attente de validation restaurant.
- Les doublons de plats sont agrégés identiquement pour devis et commande ; limite de 20 portions par plat.
- Pas de quotas d'utilisation, de cumul de codes ni de ciblage par client dans cette tranche.

## Déploiement et recette

Migration additive : `20260902210000_coupon_checkout`. Ne pas modifier les migrations déjà appliquées. Le Dockerfile utilise `docker/entrypoint.sh`, qui lance déjà `prisma migrate deploy`. Pour un autre mode de lancement, exécuter cette commande avant de servir la nouvelle API. Mettre ensuite à jour les deux applications mobiles.

Recette sur une base dédiée :

1. Créer un code à 10 %, minimum 5000 FCFA, valable un jour.
2. À 4999 FCFA, vérifier le refus et le message du minimum.
3. À 5000 FCFA, vérifier sous-total 5000, remise 500 et total 4500.
4. Commander, vérifier les mêmes montants dans le suivi client et côté restaurant.
5. Désactiver le code : une nouvelle commande doit échouer, l'ancienne doit rester à 4500.
6. Essayer ce code dans un autre restaurant, puis un code expiré : refus.
7. Réessayer une création avec la même clé après coupure réseau : aucune commande supplémentaire.
8. Tester un code à 100 % : commande visible, sans écran de paiement bloqué.

Les tests unitaires vérifient le calcul, les DTO, les limites, le périmètre du code, la revalidation et l'enregistrement des montants. Les tests avec doubles de persistance ne remplacent pas la recette PostgreSQL/Redis et le contrôle visuel sur téléphone.
