# ADR 0002 — Prisma 7 et PostGIS

- Date : 2026-08-29
- Statut : accepté
- Référence : spécification sections 5.1 et 15.1

## Contexte

Prisma 7 exige un adaptateur de driver et n’exprime pas `geography(Point, 4326)`.

## Décision

- Client Prisma 7 avec `@prisma/adapter-pg`.
- Colonne `location` en `Unsupported("geography(Point, 4326)")`.
- Déclencheur SQL qui synchronise `location` depuis `latitude` / `longitude`.
- Index GiST et fonction `onmangeou_normalize_text` dans une migration SQL relue.

## Conséquences

Toute migration générée ensuite doit être relue pour ne pas supprimer ces objets.
