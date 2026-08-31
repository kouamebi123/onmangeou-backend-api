# OnMangeOu — backend API

Dépôt autonome des règles métier, de l’API REST `/api/v1` et des workers.

## Référence

- Spécification maître : `docs/reference/OnMangeOu_Specification_Technique_Maitre.md`
- Tokens de marque : `docs/reference/onmangeou-tokens.json`
- Contrat OpenAPI : `openapi/onmangeou-v1.json`

## Périmètre

Identité (OTP, sessions), organisations, établissements, catalogue, découverte géospatiale, entitlements, audit, outbox, administration (vérification).

Les commandes, paiements, caisse, stock, réservations, avis et marketing appartiennent aux tranches suivantes.

## Commandes

```bash
pnpm db:up
pnpm prisma:deploy
pnpm seed
pnpm start:dev
pnpm test
pnpm test:integration
pnpm verify
```

## Règles impératives

- TypeScript strict, aucun `any`.
- Montants en `bigint` FCFA, jamais de flottant.
- Tenant lu depuis l’identité serveur, jamais depuis le corps de requête.
- Journal d’audit append-only.
- Textes utilisateur en français via les messages du catalogue d’erreurs.
