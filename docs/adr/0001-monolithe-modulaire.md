# ADR 0001 — Monolithe modulaire

- Date : 2026-08-29
- Statut : accepté
- Référence : spécification section 4.1

## Contexte

Le produit a plusieurs domaines (identité, catalogue, commandes, paiements) mais un marché initial unique et une équipe restreinte.

## Décision

Déployer une API NestJS unique. Séparer les domaines dans le code, les schémas, les services et l’outbox. Extraire plus tard paiements, notifications ou recherche uniquement si les mesures le justifient.

## Conséquences

- Un seul pipeline, une seule base, un seul contrat OpenAPI `/api/v1`.
- Interdiction de créer un microservice par domaine sans nouvel ADR.
