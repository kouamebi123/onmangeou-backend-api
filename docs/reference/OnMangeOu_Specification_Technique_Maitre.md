# OnMangeOù
## Spécification technique maître et contrat d’exécution pour agent IA

**Version :** 1.0  
**Date :** 29 août 2026  
**Auteur et responsable produit :** Emmanuel Kouame  
**Marché initial :** restauration en Côte d’Ivoire  
**Statut :** référence normative de conception et de développement  
**Classification :** confidentiel - diffusion uniquement aux personnes autorisées

> OnMangeOù doit devenir le point de rencontre entre les personnes qui cherchent où manger et les restaurants qui veulent être visibles, vendre davantage et piloter leur activité avec simplicité.

---

# 1. Fonction de ce document

Ce document est la source technique de référence pour construire OnMangeOù conformément au dossier stratégique, au cahier des charges et à la charte graphique. Il est destiné à Emmanuel Kouame, aux développeurs, designers, testeurs, prestataires et agents d’intelligence artificielle autorisés.

Il définit :

- le périmètre fonctionnel complet ;
- l’architecture logicielle et l’organisation des dépôts ;
- les technologies, versions et règles de dépendances ;
- le modèle de données et les règles métier ;
- les API, événements et machines à états ;
- la sécurité, la confidentialité et la traçabilité ;
- le fonctionnement hors connexion ;
- l’identité visuelle et le design system ;
- les tests, la qualité, le déploiement et l’exploitation ;
- la méthode obligatoire pour tout agent IA qui développe le produit.

## 1.1 Ordre de priorité documentaire

En cas de contradiction, appliquer cet ordre :

1. décision écrite et datée d’Emmanuel Kouame ;
2. présente spécification technique ;
3. cahier des charges OnMangeOù ;
4. charte graphique OnMangeOù ;
5. ticket ou user story validé ;
6. comportement du code existant ;
7. suggestion de l’agent IA.

Un agent ne doit jamais modifier silencieusement une règle métier. Toute divergence doit être signalée dans une ADR, une pull request ou une question explicite.

## 1.2 Sens des termes normatifs

- **DOIT / INTERDIT** : exigence obligatoire.
- **DEVRAIT** : recommandation forte ; tout écart doit être justifié.
- **PEUT** : option autorisée.
- **HORS PÉRIMÈTRE** : ne pas développer sans nouvelle validation.
- **MODULE** : capacité activable selon l’abonnement et la configuration du restaurant.
- **ÉTABLISSEMENT** : site physique d’un restaurant ou d’une enseigne.
- **ORGANISATION** : entité commerciale pouvant posséder un ou plusieurs établissements.

# 2. Vision produit et principes non négociables

OnMangeOù n’est pas seulement une application de livraison. C’est une plateforme à deux faces et un système de gestion modulaire :

- côté public : trouver un restaurant, consulter son menu, le localiser, réserver, commander, payer, suivre et donner un avis ;
- côté restaurant : créer une vitrine, gérer les commandes, la salle, la caisse, les dépenses, les crédits, les dettes, le stock facultatif, l’équipe, le marketing et les statistiques ;
- côté plateforme : contrôler les accès, vérifier les établissements, administrer les abonnements, modérer, assister, auditer et surveiller la santé du service.

Principes obligatoires :

1. mobile d’abord et Android prioritaire ;
2. découverte possible sans création de compte ;
3. français de Côte d’Ivoire en langue initiale ;
4. montants exprimés en FCFA, sans décimales ;
5. heure affichée en `Africa/Abidjan`, données enregistrées en UTC ;
6. modules invisibles lorsqu’ils ne sont pas activés ;
7. actions courantes réalisables en trois interactions utiles au maximum lorsque possible ;
8. fonctionnement résilient sur connexion faible ;
9. aucune commande ou transaction dupliquée lors d’un double clic ou d’une reprise réseau ;
10. aucune confirmation de paiement basée uniquement sur le retour de l’application cliente ;
11. aucune donnée financière supprimée physiquement après validation ; correction par écriture compensatoire ;
12. données isolées par organisation et établissement ;
13. sécurité et journalisation dès la première version ;
14. photos optimisées pour limiter le coût de données mobiles ;
15. interface chaleureuse, simple, fiable et conforme à la marque.

# 3. Périmètre des produits

## 3.1 Application mobile client

Application gratuite destinée au public :

- découverte locale sur carte et liste synchronisées ;
- recherche par restaurant, plat, type de cuisine, quartier ou repère ;
- filtres prix, distance, ouvert maintenant, livraison, retrait, réservation, paiement, terrasse, climatisation, halal, végétarien et accessibilité ;
- fiche restaurant vérifiée ;
- menu, catégories, variantes, suppléments, disponibilités et allergènes déclarés ;
- panier mono-restaurant ;
- commande immédiate ou programmée ;
- retrait, consommation sur place, livraison ou réservation de plat ;
- réservation de table ;
- paiement selon les moyens activés ;
- suivi de commande ;
- favoris, restaurants suivis et historique ;
- avis vérifiés, commentaires et photos ;
- événements, promotions et bons plans ;
- notifications paramétrables ;
- gestion du profil, des adresses, du consentement et des données personnelles.

## 3.2 Application mobile restaurant

Application payante et modulaire :

- onboarding et vérification ;
- configuration de l’organisation et des établissements ;
- vitrine, horaires, localisation, galerie et menu ;
- gestion de disponibilité et rupture ;
- réception et traitement des commandes ;
- commandes manuelles provenant de la salle, du téléphone ou de WhatsApp ;
- réservation et plan de salle selon module ;
- caisse, encaissements et clôtures ;
- achats, dépenses, crédits clients, dettes fournisseurs et emprunts ;
- stock désactivé, simple ou détaillé par ingrédients ;
- cuisine et file de préparation ;
- livraison interne ou partenaire ;
- employés, rôles, sessions et autorisations ;
- coupons, événements, bons plans et fidélité ;
- rapports, exports et alertes ;
- abonnement, factures et modules actifs ;
- support et signalement d’incident.

## 3.3 Web public

Le web public DOIT offrir :

- pages indexables des restaurants et menus ;
- recherche et consultation légère ;
- partage par lien et QR ;
- redirection vers l’application ou poursuite web lorsque possible ;
- pages légales, aide et contact ;
- rendu serveur pour le référencement et les performances.

## 3.4 Back-office administration

Le back-office DOIT permettre :

- gestion des utilisateurs, organisations, établissements et employés ;
- validation des établissements et documents ;
- administration des offres, modules et abonnements ;
- supervision des commandes et paiements ;
- gestion des remboursements avec double validation pour les montants sensibles ;
- modération des avis, images, événements et signalements ;
- support, tickets, litiges et historique ;
- détection d’anomalies, fraude et abus ;
- configuration distante contrôlée ;
- tableaux de bord opérationnels ;
- consultation des journaux d’audit sans possibilité de les altérer.

## 3.5 Hors périmètre sans validation supplémentaire

- flotte de livraison possédée par OnMangeOù ;
- réseau social généraliste ;
- comptabilité légale complète remplaçant un comptable ;
- conservation directe des fonds des clients ;
- portefeuille électronique interne ;
- intelligence artificielle prenant seule des décisions financières ou de modération définitive ;
- architecture microservices prématurée ;
- commande multi-restaurants dans un même panier ;
- cryptoactifs.

# 4. Architecture cible

## 4.1 Style architectural

Le système commence sous forme de **monolithe modulaire**. Les domaines sont séparés dans le code, les schémas, les services et les événements, mais sont déployés dans une API principale. Cette approche réduit les coûts et la complexité tout en préservant une extraction future des paiements, notifications, recherche ou livraison.

Architecture logique :

```text
Applications client / restaurant / web / administration
                         |
                  API REST versionnée
                         |
  Auth - Catalogue - Commandes - Réservations - Paiements
  Finance - Stock - Livraison - Avis - Marketing - Support
                         |
      PostgreSQL/PostGIS - Redis - Stockage objet - Files
                         |
 Paiement - SMS/Push - Cartographie - E-mail - Observabilité
```

## 4.2 Applications et responsabilités

| Composant | Responsabilité | Technologie |
| --- | --- | --- |
| `onmangeou-mobile-client` | expérience client Android/iOS | Expo SDK 57, React Native, Expo Router |
| `onmangeou-mobile-restaurant` | exploitation et gestion restaurant | Expo SDK 57, React Native, Expo Router |
| `onmangeou-web-public` | web public et pages indexables | Next.js 16 App Router |
| `onmangeou-backoffice-admin` | back-office interne | Next.js 16 App Router |
| `onmangeou-backend-api` | règles métier, API REST et workers | NestJS 12 avec Express + BullMQ |
| `database` | données transactionnelles et géospatiales | PostgreSQL 18 + PostGIS |
| `cache/queue` | cache, verrous courts, limitation et files | Redis compatible |
| `object-storage` | images, exports et documents | S3 compatible + CDN |

## 4.3 Pourquoi deux applications mobiles

Les parcours client et restaurant ont des permissions, rythmes de publication, exigences hors ligne et interfaces très différents. Ils partagent le design system, les types, le client API et les utilitaires, mais restent deux applications publiables séparément. Ne pas créer une application unique conditionnée par un rôle.

## 4.4 Multi-tenant

- Toute donnée professionnelle porte un `organization_id`.
- Toute donnée propre à un site porte également un `establishment_id`.
- Le tenant est déterminé côté serveur depuis l’identité authentifiée ; il ne doit jamais être accepté aveuglément depuis le corps d’une requête.
- Les requêtes Prisma sont enveloppées dans des services imposant le périmètre tenant.
- Les tests d’isolation inter-tenant sont obligatoires.
- Une organisation multisite peut agréger ses données uniquement si le rôle le permet.

# 5. Stack technique de référence

## 5.1 Versions initiales recommandées

| Domaine | Choix | Règle |
| --- | --- | --- |
| Runtime | Node.js 24 LTS, version compatible Nest CLI | verrouiller avec `.nvmrc` et `engines` |
| Langage | TypeScript strict | aucun `any` non justifié |
| Dépôts | cinq dépôts Git autonomes | déploiement, secrets et CI indépendants |
| Gestionnaire | pnpm dans chaque dépôt | un lockfile commité par dépôt |
| Mobile | Expo SDK 57 / React Native 0.86 / React 19.2 | development builds, pas Expo Go en production |
| Web | Next.js 16 App Router | Server Components par défaut |
| API | NestJS 12, Express par défaut | REST `/api/v1` |
| ORM | Prisma 7 stable | migrations SQL relues ; SQL brut autorisé pour PostGIS |
| Base | PostgreSQL 18 | sauvegardes PITR |
| Géospatial | PostGIS 3.x | index GiST |
| Cache/files | Redis + BullMQ | files persistantes pour travaux critiques |
| Validation | class-validator côté Nest, Zod dans les clients | schémas partagés lorsque pertinent |
| API | OpenAPI 3 générée par Nest | contrat versionné |
| Tests | Vitest/Jest, Supertest, Playwright, Maestro | seuils de couverture par domaine |
| Qualité | ESLint, Prettier, TypeScript, commitlint | exécutés en CI |

Les versions exactes DOIVENT être fixées dans `package.json` et `pnpm-lock.yaml`. L’agent ne doit pas utiliser `latest`, une version beta, canary ou release candidate sans autorisation. Les mises à jour majeures sont des tâches séparées avec tests de migration.

## 5.2 Bibliothèques recommandées

- interface mobile : React Native Paper ou composants internes fondés sur les tokens OnMangeOù ; ne pas mélanger plusieurs bibliothèques visuelles ;
- état serveur : TanStack Query ;
- état local limité : Zustand ;
- formulaires : React Hook Form + Zod ;
- stockage sécurisé : `expo-secure-store` ;
- base hors ligne : `expo-sqlite` ;
- listes : FlashList si les mesures le justifient ;
- images : `expo-image` ;
- localisation : `expo-location` avec consentement explicite ;
- notifications : `expo-notifications` et service backend ;
- cartes : MapLibre React Native ou adaptateur cartographique validé ;
- logs API : Pino JSON ;
- erreurs : Sentry ;
- métriques et traces : OpenTelemetry ;
- tests mobiles E2E : Maestro ;
- dates : date-fns avec locale française ;
- calcul monétaire : entiers et fonctions métier internes, jamais `float`.

## 5.3 Politique de dépendances

- préférer les dépendances maintenues, documentées et compatibles avec l’architecture React Native actuelle ;
- vérifier licence, activité, vulnérabilités et taille avant ajout ;
- aucune bibliothèque pour une fonction triviale ;
- aucune clé secrète dans le bundle mobile ou web ;
- `pnpm audit` et analyse de dépendances en CI ;
- Dependabot ou Renovate ouvre des PR, sans fusion automatique des versions majeures ;
- documenter tout remplacement structurant dans `/docs/adr`.

# 6. Organisation des dépôts

## 6.1 Espace de travail local

Le dossier `OnMangeOu-Workspace` est un conteneur local permettant d’ouvrir tout le projet dans Cursor. Il ne doit pas être lui-même initialisé comme dépôt Git. Chacun de ses cinq sous-dossiers est un dépôt autonome, avec son propre historique, ses secrets, son pipeline et son hébergement.

```text
OnMangeOu-Workspace/                 # dossier local, sans dépôt Git parent
├── docs-partages/                   # documents maîtres, hors déploiement
│   ├── OnMangeOu_Specification_Technique_Maitre.md
│   ├── OnMangeOu_Dossier_Strategique_Cahier_des_Charges.pdf
│   └── OnMangeOu_Charte_Graphique.pdf
├── onmangeou-web-public/            # dépôt Git 1
├── onmangeou-backend-api/           # dépôt Git 2
├── onmangeou-mobile-client/         # dépôt Git 3
├── onmangeou-mobile-restaurant/     # dépôt Git 4
├── onmangeou-backoffice-admin/      # dépôt Git 5
└── OnMangeOu.code-workspace         # espace multi-dossiers Cursor, facultatif
```

Les documents partagés sont la référence, mais chaque dépôt DOIT contenir un `AGENTS.md` résumant son périmètre et pointant vers la spécification maître. Si un agent n’a accès qu’à un seul dépôt, copier la version Markdown dans son dossier `docs/reference/` et la mettre à jour lors de chaque changement de version.

## 6.2 Dépôt web public

```text
onmangeou-web-public/
├── src/
│   ├── app/
│   ├── components/
│   ├── features/
│   ├── lib/
│   ├── styles/
│   └── i18n/
├── public/brand/
├── tests/
├── docs/
├── .github/workflows/
├── .env.example
├── AGENTS.md
├── next.config.ts
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json
```

Ce dépôt ne contient aucune règle financière faisant autorité. Il consomme l’API publique et le client TypeScript généré depuis l’OpenAPI du backend.

## 6.3 Dépôt backend et workers

```text
onmangeou-backend-api/
├── src/
│   ├── api/
│   ├── domains/
│   ├── infrastructure/
│   ├── workers/
│   ├── common/
│   └── main.ts
├── prisma/
│   ├── migrations/
│   ├── schema.prisma
│   └── seed.ts
├── openapi/
│   └── onmangeou-v1.json
├── infra/
│   ├── docker/
│   ├── terraform/
│   └── monitoring/
├── tests/
├── docs/
│   ├── adr/
│   ├── api/
│   ├── runbooks/
│   └── security/
├── .github/workflows/
├── docker-compose.yml
├── .env.example
├── AGENTS.md
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json
```

Le worker reste dans ce dépôt. L’API et le worker peuvent être deux processus ou deux services d’hébergement distincts construits depuis la même révision. Ils partagent les domaines, Prisma, les événements et les règles métier sans publication de package privé.

## 6.4 Dépôts mobiles

Les dépôts `onmangeou-mobile-client` et `onmangeou-mobile-restaurant` utilisent la même structure, mais restent complètement publiables séparément.

```text
onmangeou-mobile-*/
├── app/                             # routes Expo Router
├── src/
│   ├── components/
│   ├── features/
│   ├── api/
│   ├── offline/
│   ├── store/
│   ├── theme/
│   └── i18n/
├── assets/brand/
├── tests/
├── docs/
├── .github/workflows/
├── app.config.ts
├── eas.json
├── .env.example
├── AGENTS.md
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json
```

Ne pas utiliser de dépendance par chemin local entre les deux applications. Les composants similaires peuvent être reproduits à partir des mêmes tokens, mais chaque application contrôle sa propre publication et ses dépendances natives.

## 6.5 Dépôt back-office

```text
onmangeou-backoffice-admin/
├── src/
│   ├── app/
│   ├── components/
│   ├── features/
│   ├── api/
│   ├── auth/
│   └── styles/
├── public/brand/
├── tests/
├── docs/
├── .github/workflows/
├── .env.example
├── AGENTS.md
├── next.config.ts
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json
```

Le back-office est un frontend web interne. Il ne possède pas sa propre base et n’accède jamais directement à PostgreSQL : toutes ses opérations passent par les endpoints administratifs sécurisés du backend.

## 6.6 Partage des contrats sans monorepo

- Le backend génère et versionne `openapi/onmangeou-v1.json`.
- Sa CI publie ce fichier comme artefact de release ou package généré versionné.
- Chaque frontend génère son client TypeScript depuis une version précise du contrat.
- Une modification incompatible exige une nouvelle version d’API ; ne jamais casser silencieusement les clients déployés.
- Les design tokens sont conservés dans un fichier JSON maître versionné avec la documentation, puis synchronisés explicitement dans chaque frontend.
- Aucun frontend ne copie les règles de calcul du backend. Les totaux, permissions, disponibilités et transitions faisant autorité viennent de l’API.
- Chaque dépôt possède ses propres variables d’environnement, scans, tests et règles de protection de branche.

## 6.7 Conventions de code

- fichiers TypeScript en `kebab-case` ; composants React en `PascalCase` ; variables en `camelCase` ; constantes globales en `UPPER_SNAKE_CASE` ;
- noms du domaine en anglais dans le code ; textes utilisateur en français via i18n ;
- contrôleurs minces, règles métier dans services de domaine ;
- accès base uniquement dans repositories/services autorisés ;
- DTO d’entrée distincts des modèles de sortie ;
- aucune exception interne envoyée telle quelle au client ;
- toutes les fonctions financières critiques documentent invariants et cas limites ;
- pas de commentaire décrivant ce que le code évident fait ; commenter le pourquoi ;
- pas de fichier métier géant ; viser une responsabilité claire ;
- imports via alias de package, sans chemins relatifs profonds.

## 6.8 Branches et commits

- branche protégée `main` ;
- branches `feat/`, `fix/`, `chore/`, `docs/` ;
- Conventional Commits ;
- PR obligatoire avec tests, capture UI si visuel, migration si données et notes de sécurité ;
- aucune fusion si formatage, typage, tests ou migration échouent.

# 7. Domaines backend

Chaque domaine possède module Nest, services, DTO, politiques d’autorisation, événements, tests et documentation.

| Domaine | Responsabilité principale |
| --- | --- |
| Identity | comptes, OTP, sessions, appareils, MFA |
| Organizations | organisations, établissements, vérification |
| Catalog | catégories, menus, produits, variantes, options, disponibilité |
| Discovery | recherche, filtres, proximité, favoris |
| Orders | paniers, commandes, lignes, statuts, preuves |
| Reservations | tables, créneaux, capacité, acompte, liste d’attente |
| Payments | intents, prestataires, webhooks, remboursements, rapprochement |
| Cash & Finance | caisse, ventes, dépenses, achats, crédits, dettes, emprunts |
| Inventory | articles, ingrédients, mouvements, recettes, inventaires |
| Kitchen | tickets cuisine, priorités, délais |
| Delivery | zones, missions, livreurs, statuts, preuves |
| Reviews | avis vérifiés, notes, photos, réponses, signalements |
| Marketing | promotions, coupons, événements, bons plans, fidélité |
| Subscriptions | plans, modules, entitlements, factures, essais |
| Notifications | push, SMS, e-mail, modèles et préférences |
| Support | tickets, conversations, pièces jointes, SLA |
| Moderation | contenu, décisions, recours, historique |
| Administration | configuration, supervision et actions sensibles |
| Audit | journal immuable des actions critiques |

# 8. Modèle de données

## 8.1 Règles globales

- identifiants UUIDv7 ou UUID ; jamais d’identifiant séquentiel exposé ;
- champs `created_at`, `updated_at` en `timestamptz` ;
- `deleted_at` uniquement pour suppression logique autorisée ;
- argent en `bigint` représentant le FCFA ;
- coordonnées en `geography(Point, 4326)` ;
- statuts sous forme d’enums contrôlés ;
- métadonnées libres limitées et validées ; pas de JSON servant à éviter une vraie modélisation ;
- index sur clés étrangères, tenant, statuts, dates et colonnes de recherche ;
- contraintes d’unicité et invariants également en base ;
- migrations réversibles quand possible et sauvegarde avant migration destructive.

## 8.2 Entités principales

### Identité

- `users` : téléphone E.164, e-mail facultatif, nom, statut, langue ;
- `user_profiles` : avatar et préférences ;
- `auth_identities` : type de connexion et identifiant vérifié ;
- `otp_challenges` : hash du code, expiration, tentatives, usage ;
- `sessions` : refresh token hashé, appareil, IP tronquée, expiration, révocation ;
- `devices` : installation, plateforme, version et push token ;
- `consents` : type, version de politique, date et preuve.

### Organisations et accès

- `organizations` ;
- `establishments` ;
- `establishment_hours` et exceptions ;
- `organization_members` ;
- `roles`, `permissions`, `role_permissions` ;
- `member_establishments` ;
- `verification_cases` et `verification_documents` ;
- `module_entitlements`.

### Catalogue

- `menus`, `menu_schedules`, `menu_categories` ;
- `products`, `product_images`, `product_availability` ;
- `option_groups`, `options`, `product_option_groups` ;
- `tags`, `allergens`, `product_allergens` ;
- `price_history` ;
- `restaurant_services`.

### Commandes

- `carts`, `cart_items`, `cart_item_options` ;
- `orders`, `order_items`, `order_item_options` ;
- `order_status_history` ;
- `order_adjustments` : remise, frais, taxe future, pourboire ;
- `order_notes` et `order_proofs` ;
- `idempotency_keys`.

### Réservations

- `dining_tables`, `table_areas` ;
- `reservation_rules`, `availability_slots` ;
- `reservations`, `reservation_status_history` ;
- `waitlist_entries`.

### Paiement

- `payment_intents` ;
- `payment_attempts` ;
- `provider_transactions` ;
- `payment_webhooks` ;
- `refunds` ;
- `settlements` et `settlement_lines` ;
- `reconciliation_runs` ;
- `financial_ledger_entries` en partie double ou écriture équilibrée.

### Gestion restaurant

- `cash_registers`, `cash_sessions`, `cash_movements` ;
- `expenses`, `expense_categories`, `expense_attachments` ;
- `purchases`, `purchase_items`, `suppliers` ;
- `customer_credits`, `credit_payments` ;
- `supplier_debts`, `debt_payments` ;
- `loans`, `loan_installments` ;
- `accounting_exports`.

### Stock

- `inventory_items`, `units` ;
- `stock_locations` ;
- `stock_movements` ;
- `recipes`, `recipe_ingredients` ;
- `stock_counts`, `stock_count_lines` ;
- `waste_records` ;
- `reorder_rules`.

### Livraison

- `delivery_zones` géographiques ;
- `delivery_quotes` ;
- `delivery_tasks` ;
- `couriers` et `courier_locations` à rétention courte ;
- `delivery_status_history` ;
- `delivery_proofs`.

### Engagement et contenu

- `favorites`, `follows` ;
- `reviews`, `review_scores`, `review_images`, `review_reports`, `review_responses` ;
- `events`, `deals`, `promotions`, `coupons`, `coupon_redemptions` ;
- `loyalty_accounts`, `loyalty_transactions` ;
- `notifications`, `notification_preferences`.

### Plateforme

- `subscription_plans`, `plan_modules`, `subscriptions`, `subscription_invoices` ;
- `support_tickets`, `support_messages` ;
- `moderation_cases`, `moderation_actions`, `appeals` ;
- `audit_logs`, `outbox_events`, `feature_flags`, `system_settings`.

## 8.3 Contraintes essentielles

- une commande appartient à un seul établissement ;
- le panier ne contient que les produits d’un établissement ;
- le prix et le nom d’un article sont copiés dans la ligne de commande ; un changement futur du menu ne modifie pas l’historique ;
- un avis public exige une commande terminée ou une preuve de visite valide ;
- une écriture de caisse validée ne se supprime pas ;
- un mouvement de stock est append-only ;
- un paiement fournisseur n’est unique que par `(provider, provider_transaction_id)` ;
- un webhook est traité une seule fois ;
- une réduction ne peut rendre le total négatif ;
- un remboursement ne peut dépasser le montant capturé moins les remboursements déjà validés ;
- un membre ne peut accéder qu’aux établissements qui lui sont attribués.

# 9. Rôles et autorisations

## 9.1 Rôles restaurant initiaux

| Capacité | Propriétaire | Gérant | Caissier | Serveur | Cuisine | Livreur | Comptable |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Paramètres organisation | oui | limité | non | non | non | non | lecture |
| Employés et rôles | oui | oui limité | non | non | non | non | non |
| Menu | oui | oui | limité | lecture | lecture | non | lecture |
| Commandes | oui | oui | oui | oui | préparation | livraison assignée | lecture |
| Encaissement | oui | oui | oui | selon permission | non | espèces livraison | lecture |
| Dépenses | oui | oui | créer | non | non | non | oui |
| Marge et rapports | oui | oui | limité | non | non | non | oui |
| Stock | oui | oui | lecture | non | consommation | non | lecture |
| Remboursement | oui | selon plafond | non | non | non | non | lecture |

La matrice réelle est fondée sur des permissions atomiques, pas sur des conditions dispersées dans le code. Exemple : `orders.read`, `orders.accept`, `payments.refund`, `expenses.approve`, `reports.margin.read`.

## 9.2 Principes d’autorisation

- authentification, tenant, établissement, rôle et propriété de l’objet sont vérifiés côté API ;
- l’interface masque les actions interdites mais ne constitue jamais la sécurité ;
- toute action sensible produit un audit avec acteur, objet, avant/après, heure, appareil et motif ;
- réauthentification ou MFA pour remboursement, changement de paiement, export massif et gestion des rôles ;
- seuils de double validation configurables.

# 10. API REST

## 10.1 Standards

- préfixe `/api/v1` ;
- JSON UTF-8 ;
- dates ISO 8601 UTC ;
- téléphone E.164 ;
- pagination curseur ;
- filtres explicitement autorisés ;
- `X-Request-Id` retourné ;
- `Idempotency-Key` obligatoire pour création de commande, paiement, remboursement et écritures critiques ;
- erreurs RFC 7807 ou format uniforme équivalent ;
- OpenAPI générée, testée et publiée ;
- compatibilité conservée dans une version majeure ;
- limitation de débit par IP, utilisateur, appareil et opération coûteuse.

## 10.2 Format de réponse

```json
{
  "data": {},
  "meta": { "requestId": "uuid", "nextCursor": null }
}
```

```json
{
  "type": "https://api.onmangeou.ci/problems/order-not-payable",
  "title": "Commande non payable",
  "status": 409,
  "code": "ORDER_NOT_PAYABLE",
  "detail": "La commande a expiré.",
  "requestId": "uuid",
  "fields": []
}
```

## 10.3 Endpoints principaux

### Authentification

- `POST /auth/otp/request`
- `POST /auth/otp/verify`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/mfa/challenge`
- `GET /me`
- `PATCH /me`
- `DELETE /me`

### Découverte et catalogue

- `GET /discovery/restaurants`
- `GET /restaurants/{slug}`
- `GET /restaurants/{id}/menus`
- `GET /restaurants/{id}/availability`
- `GET /restaurants/{id}/events`
- `GET /search/suggestions`
- `POST /favorites/{restaurantId}`
- `DELETE /favorites/{restaurantId}`

### Panier et commande

- `GET /cart`
- `PUT /cart/items`
- `PATCH /cart/items/{id}`
- `DELETE /cart/items/{id}`
- `POST /orders/quote`
- `POST /orders`
- `GET /orders/{id}`
- `POST /orders/{id}/cancel`
- `POST /orders/{id}/confirm-pickup`

### Restaurant

- `POST /merchant/organizations`
- `POST /merchant/establishments`
- `PATCH /merchant/establishments/{id}`
- `PUT /merchant/establishments/{id}/hours`
- `POST /merchant/menus`
- `POST /merchant/products`
- `PATCH /merchant/products/{id}/availability`
- `GET /merchant/orders`
- `POST /merchant/orders/{id}/accept`
- `POST /merchant/orders/{id}/reject`
- `POST /merchant/orders/{id}/status`

### Paiement et finance

- `POST /payments/intents`
- `GET /payments/intents/{id}`
- `POST /payments/webhooks/{provider}` sans authentification utilisateur mais signature obligatoire
- `POST /merchant/refunds`
- `POST /merchant/cash-sessions`
- `POST /merchant/cash-movements`
- `POST /merchant/expenses`
- `POST /merchant/purchases`
- `POST /merchant/credits`
- `POST /merchant/debts`
- `GET /merchant/reports/daily`

### Réservation, avis et marketing

- `POST /reservations/quote`
- `POST /reservations`
- `POST /reservations/{id}/cancel`
- `POST /reviews`
- `POST /reviews/{id}/images`
- `POST /reviews/{id}/report`
- `POST /merchant/reviews/{id}/response`
- `POST /merchant/events`
- `POST /merchant/promotions`
- `POST /merchant/coupons`

L’inventaire final des endpoints doit être généré depuis OpenAPI. Cette liste décrit le noyau, pas l’intégralité des routes techniques.

# 11. Machines à états

## 11.1 Commande

```text
DRAFT
  -> PENDING_PAYMENT
  -> PENDING_RESTAURANT
  -> ACCEPTED
  -> PREPARING
  -> READY
  -> PICKED_UP | OUT_FOR_DELIVERY
  -> COMPLETED

États terminaux alternatifs : REJECTED, CANCELLED, EXPIRED, FAILED.
```

Règles :

- toute transition est validée côté serveur ;
- historique append-only ;
- le restaurant ne peut accepter une commande expirée ;
- le client ne peut annuler que selon la politique calculée ;
- `COMPLETED` ouvre la possibilité d’un avis ;
- les événements sont publiés via outbox transactionnelle.

## 11.2 Paiement

```text
CREATED -> REQUIRES_ACTION -> PROCESSING -> SUCCEEDED
                     |             |          |
                     v             v          v
                  CANCELLED      FAILED    PARTIALLY_REFUNDED -> REFUNDED
```

Le webhook signé du prestataire est la source de vérité. Le polling ne fait que lire. Un même événement répété doit produire le même résultat sans nouvelle écriture financière.

## 11.3 Réservation

```text
REQUESTED -> CONFIRMED -> SEATED -> COMPLETED
     |           |          |
     v           v          v
  REJECTED    CANCELLED    NO_SHOW
```

## 11.4 Livraison

```text
UNASSIGNED -> ASSIGNED -> PICKUP_PENDING -> PICKED_UP -> DELIVERING -> DELIVERED
      |           |              |                |
      +-----------+--------------+--------------> CANCELLED/FAILED
```

# 12. Paiements et rapprochement

## 12.1 Moyens prioritaires

- Wave ;
- Orange Money ;
- MTN Mobile Money ;
- Moov Money ;
- carte bancaire ;
- espèces ou paiement sur place lorsque le restaurant l’autorise.

Une interface `PaymentProvider` isole chaque prestataire :

```ts
interface PaymentProvider {
  createIntent(input: CreatePaymentInput): Promise<ProviderIntent>;
  getStatus(reference: string): Promise<ProviderStatus>;
  verifyWebhook(headers: Headers, rawBody: Buffer): VerifiedEvent;
  refund(input: RefundInput): Promise<ProviderRefund>;
}
```

## 12.2 Exigences critiques

- ne jamais stocker PIN Mobile Money ou données complètes de carte ;
- TLS obligatoire ;
- signature webhook vérifiée sur le corps brut ;
- allowlist IP seulement en défense supplémentaire ;
- unicité du numéro de transaction fournisseur ;
- clé d’idempotence par tentative ;
- délai et reprise exponentielle ;
- journal des payloads expurgés ;
- rapprochement automatique quotidien ;
- file manuelle pour différences ;
- remboursement avec motif, rôle et audit ;
- aucun secret fournisseur dans l’application mobile ;
- environnement sandbox distinct de production.

## 12.3 Comptabilité de plateforme

Toutes les opérations financières utilisent un journal équilibré : compte client, restaurant, prestataire, frais, remboursement et compte de compensation. Ne jamais recalculer l’historique à partir du seul statut courant.

# 13. Finance restaurant

OnMangeOù fournit une gestion simplifiée, pas un logiciel de comptabilité réglementaire complet.

## 13.1 Caisse

- ouverture avec fonds initial ;
- ventes par moyen de paiement ;
- entrées et sorties motivées ;
- paiement mixte ;
- clôture attendue/réelle ;
- écart et commentaire ;
- réouverture uniquement avec permission et audit.

## 13.2 Dépenses, achats, crédits et dettes

- catégorie, montant, date, moyen, établissement et justificatif ;
- paiement partiel et échéance ;
- historique non destructif ;
- rappel configurable ;
- export CSV/PDF ;
- visibilité restreinte selon rôle.

## 13.3 Règles monétaires

- `amount_xof` en entier ;
- somme côté serveur à partir des prix enregistrés ;
- le client n’envoie jamais un total faisant foi ;
- arrondi explicite ;
- devise `XOF` fixée initialement ;
- format affiché `12 500 FCFA` ;
- tests par propriétés sur remises, totaux, remboursements et paiements partiels.

# 14. Stock facultatif

Trois modes exclusifs par établissement :

1. `NONE` : aucun écran, champ, alerte ou contrainte de stock ;
2. `SIMPLE` : quantité par produit ou article ;
3. `INGREDIENT` : ingrédients, unités, recettes et consommation calculée.

Mouvements : entrée, vente, consommation recette, correction, perte, transfert et inventaire. Chaque mouvement conserve quantité avant/après, unité, coût, origine, acteur et motif. Les quantités ne sont jamais éditées directement.

La rupture d’un produit peut être manuelle ou calculée. En cas de conflit hors ligne, le serveur accepte l’écriture financière mais signale un stock négatif à régulariser selon la règle de l’établissement.

# 15. Recherche, carte et localisation

## 15.1 Données géographiques

- coordonnées WGS84 ;
- point exact de l’établissement ;
- commune, quartier et texte de repère ;
- repère vocal facultatif stocké séparément ;
- zone de livraison en polygone ou rayon ;
- index GiST ;
- `ST_DWithin` pour filtrer et opérateur KNN pour trier par proximité.

## 15.2 Carte

- MapLibre avec fournisseur de tuiles respectant les conditions d’usage ;
- ne pas appeler directement le serveur public OpenStreetMap en production à grande échelle ;
- regroupement de marqueurs ;
- carte et liste synchronisées ;
- bouton « Rechercher dans cette zone » ;
- chargement progressif ;
- cache de tuiles conforme à la licence ;
- consentement avant géolocalisation ;
- saisie manuelle toujours disponible.

## 15.3 Recherche

Commencer avec PostgreSQL : `unaccent`, trigrammes, recherche plein texte, synonymes de plats et dictionnaire local. Normaliser accents, casse et variantes usuelles. Prévoir l’interface d’un moteur externe, mais ne déployer Meilisearch/OpenSearch que si les mesures le justifient.

# 16. Fonctionnement hors connexion

## 16.1 Données locales

- TanStack Query pour cache réseau ;
- SQLite pour données persistantes et file outbox ;
- SecureStore pour secrets courts ;
- aucune donnée de paiement sensible dans SQLite ;
- chiffrement complémentaire pour données professionnelles sensibles si nécessaire.

## 16.2 Actions autorisées hors ligne

Restaurant : lecture du menu récemment synchronisé, saisie d’une dépense, commande de salle, modification temporaire de disponibilité et consultation de la file locale. Client : consultation limitée des éléments en cache et préparation d’un panier.

Paiement en ligne, remboursement, validation d’abonnement et action administrative sensible exigent une connexion serveur.

## 16.3 Outbox mobile

Chaque mutation locale contient : identifiant client UUID, type, payload validé, date locale, version de schéma, tentatives et statut. La synchronisation est FIFO par agrégat, avec idempotence serveur, backoff et interface de résolution lorsque le conflit exige une décision humaine.

## 16.4 Politique de conflit

- commande et argent : serveur autoritaire, jamais fusion automatique hasardeuse ;
- menu : dernière version serveur avec alerte si modification concurrente ;
- disponibilité : dernière écriture acceptée, avec audit ;
- profil : fusion champ par champ possible ;
- stock : mouvements cumulés, pas remplacement de quantité.

# 17. Images, médias et fichiers

- upload par URL présignée ;
- contrôle MIME et signature réelle ;
- taille maximale par type ;
- antivirus pour documents ;
- suppression EXIF et géolocalisation des photos ;
- génération de miniatures WebP/AVIF et fallback JPEG ;
- compression côté appareil puis traitement serveur ;
- clés objet non prévisibles ;
- CDN ;
- images privées avec URL temporaire ;
- texte alternatif pour images éditoriales ;
- modération automatique d’assistance, décision finale humaine en cas sensible ;
- quota par utilisateur et établissement.

# 18. Notifications

Canaux : push, SMS, e-mail et WhatsApp uniquement via fournisseur autorisé et consentement applicable.

Types : transactionnel, opérationnel, sécurité et marketing. Le marketing est désactivable séparément. Les notifications transactionnelles essentielles ne doivent pas dépendre du consentement marketing.

La table de notifications conserve modèle, version, canal, destinataire pseudonymisé, statut, tentatives et fournisseur. Les tâches passent par une file et utilisent une clé de déduplication.

# 19. Design system OnMangeOù

## 19.1 Logo

Le logo officiel associe :

- une épingle de localisation ;
- une assiette ;
- un sourire ;
- un accent orange ;
- le mot `OnMangeOù` placé en dessous et centré.

Utiliser les fichiers SVG maîtres. Ne pas déformer, incliner, recolorer librement, ajouter d’ombre forte, séparer les éléments ou remplacer le mot-symbole. Prévoir versions fond clair, fond sombre, monochrome et icône seule. Zone de protection minimale : 25 % de la largeur du symbole. Taille minimale indicative : 32 px pour l’icône, 120 px pour la signature complète.

## 19.2 Couleurs officielles

| Token | Hex | Usage |
| --- | --- | --- |
| `brand.deep` | `#173B36` | fonds profonds, titres, navigation |
| `brand.primary` | `#1F6F5F` | actions principales, succès, repères |
| `brand.accent` | `#E8783E` | accent, promotion, sélection, CTA secondaire |
| `brand.cream` | `#F7F2E8` | fond chaleureux et surfaces |
| `text.primary` | `#21302D` | texte principal |
| `border.default` | `#D9E1DE` | bordures et séparateurs |
| `surface.mint` | `#EEF5F2` | surfaces secondaires |
| `white` | `#FFFFFF` | cartes et texte sur fond sombre |
| `error` | `#C63D3D` | erreur uniquement |
| `warning` | `#B96912` | avertissement accessible |

Les contrastes DOIVENT atteindre WCAG AA. L’orange ne doit pas être utilisé pour un long texte sur fond clair sans contrôle de contraste. La couleur n’est jamais le seul moyen de transmettre un état.

## 19.3 Typographie

- famille : **Inter** ;
- titres : Inter Bold ;
- sous-titres : Inter SemiBold ;
- corps : Inter Regular ;
- chiffres de caisse : chiffres tabulaires ;
- fallback : système sans-serif.

Échelle mobile : `12, 14, 16, 18, 22, 28, 34`. Corps par défaut 16 px côté client, 15-16 px côté restaurant. Hauteur de ligne 1,35 à 1,55. Aucun texte essentiel inférieur à 12 px.

## 19.4 Espacement et formes

- grille de base 4 px ;
- espaces : 4, 8, 12, 16, 24, 32, 48 ;
- rayon petit 8, moyen 12, carte 16, pilule 999 ;
- cible tactile minimum 44 x 44 points ;
- ombres légères ; bordures préférées aux ombres lourdes ;
- marges écran 16 px mobile et 24-32 px tablette/web.

## 19.5 Composants obligatoires

- Button : primary, secondary, outline, ghost, destructive, loading, disabled ;
- TextField et PhoneField ;
- Select, Checkbox, Radio, Switch ;
- SearchBar avec suggestions ;
- RestaurantCard et DishCard ;
- Price, Rating, Badge, StatusChip ;
- MapMarker et MapBottomSheet ;
- CartItem, OrderTimeline, PaymentMethodCard ;
- EmptyState, ErrorState, OfflineBanner, Skeleton ;
- Modal/BottomSheet et Toast ;
- DataTable et MetricCard côté restaurant ;
- PermissionGate ;
- ImageUploader avec progression et reprise.

Chaque composant possède états normal, pressé, focus, désactivé, chargement et erreur, plus tests visuels.

## 19.6 Ton éditorial

Inter, direct, rassurant et généreux. Utiliser des verbes concrets et des phrases courtes. Ne jamais culpabiliser l’utilisateur.

Exemples :

- `Votre commande a bien été envoyée.`
- `Le restaurant confirme votre commande.`
- `Connexion faible : vos modifications seront synchronisées.`
- `Le paiement n’a pas abouti. Aucun montant n’a été débité.`
- `Ce plat n’est plus disponible pour ce créneau.`

Éviter le jargon : `webhook`, `token`, `timeout`, `erreur 500` ne doivent pas apparaître dans les messages publics.

# 20. Expérience et navigation

## 20.1 Client

Onglets recommandés : Accueil, Explorer, Commandes, Favoris, Profil. La carte s’ouvre avec un panneau inférieur et conserve filtres et position en passant à la liste.

Le checkout affiche toujours : restaurant, articles, options, mode de service, créneau, adresse/repère, sous-total, frais, réduction, total, moyen de paiement et politique d’annulation.

## 20.2 Restaurant

Accueil selon rôle : commandes urgentes, chiffre clé autorisé, alertes et raccourcis. Navigation : Activité, Commandes, Catalogue, Gestion, Plus. Les modules désactivés ne sont pas affichés dans la navigation principale.

## 20.3 États d’interface

Tout écran réseau doit prévoir : chargement skeleton, succès, vide explicatif, hors ligne, erreur récupérable, erreur définitive et permission refusée. Les boutons critiques bloquent le double appui et montrent une progression.

## 20.4 Accessibilité

- labels accessibles ;
- ordre de lecture cohérent ;
- taille dynamique ;
- contraste AA ;
- mode sombre ultérieur mais tokens prêts ;
- réduction des animations ;
- retour haptique non indispensable à la compréhension ;
- formulaires utilisables au clavier web ;
- messages d’erreur liés au champ.

# 21. Authentification et sessions

## 21.1 Client

Découverte anonyme. Compte demandé au moment d’une action persistante ou transactionnelle. Connexion prioritaire par téléphone et OTP. Prévoir e-mail en récupération facultative.

## 21.2 Restaurant et administration

- téléphone/e-mail vérifié ;
- mot de passe robuste ou passkey ultérieure ;
- MFA obligatoire pour administrateurs et recommandé pour propriétaires ;
- sessions visibles et révocables ;
- appareil nouveau signalé ;
- verrouillage progressif et limitation anti-abus.

## 21.3 Jetons

- access token court ;
- refresh token rotatif, stocké hashé côté serveur ;
- SecureStore sur mobile ;
- cookie `HttpOnly`, `Secure`, `SameSite` adapté sur web ;
- révocation de famille de tokens en cas de réutilisation ;
- audience, issuer, expiration et identifiant de session contrôlés.

# 22. Sécurité applicative

Le système suit OWASP Top 10:2025 et OWASP API Security Top 10:2023.

Exigences :

- autorisation objet et fonction sur chaque endpoint ;
- validation en liste blanche ;
- protection mass assignment ;
- requêtes paramétrées ;
- CSP, HSTS, headers de sécurité et CORS restrictif ;
- CSRF pour authentification cookie ;
- rate limits ;
- quotas d’upload, recherche, OTP et notifications ;
- protection SSRF pour URLs externes ;
- secrets dans un gestionnaire dédié ;
- chiffrement en transit et au repos ;
- rotation de secrets ;
- SAST, dépendances et secret scanning en CI ;
- journaux sans OTP, token, PIN, carte ou document brut ;
- sauvegardes chiffrées et testées ;
- pentest avant ouverture publique et après changements majeurs.

## 22.1 Audit

Journaliser : connexion sensible, rôles, prix, menu publié, annulation, remise, caisse, dépense, remboursement, paiement, abonnement, export, consultation administrative sensible et modération. Le journal d’audit est append-only et séparé des logs techniques.

# 23. Protection des données

- minimisation ;
- finalité et consentement documentés ;
- politique de conservation par catégorie ;
- export et suppression de compte ;
- anonymisation lorsque la conservation légale ou financière subsiste ;
- coordonnées de livreur à rétention courte ;
- séparation entre données opérationnelles et marketing ;
- registre des sous-traitants ;
- environnement de test sans copie brute de production ;
- accès support temporaire, justifié et audité ;
- demandes de droits traçables.

Les exigences juridiques françaises, européennes et ivoiriennes doivent être validées par un professionnel avant production. Le code doit permettre la configuration de rétention, consentement et export sans refonte.

# 24. Performance et résilience

## 24.1 Objectifs initiaux

- API p95 lecture simple < 400 ms hors réseau mobile et fournisseur externe ;
- API p95 écriture simple < 700 ms ;
- recherche proximité p95 < 800 ms ;
- ouverture écran principal utile < 3 s sur Android moyen et réseau 4G correct ;
- crash-free sessions > 99,5 % ;
- disponibilité cible initiale 99,5 % mensuelle ;
- RPO base ≤ 15 minutes ;
- RTO ≤ 4 heures au début.

## 24.2 Techniques

- index contrôlés avec `EXPLAIN ANALYZE` ;
- pagination curseur ;
- cache des lectures publiques ;
- CDN images ;
- compression et dimensions adaptées ;
- travail externe en file ;
- circuit breaker et timeout pour fournisseurs ;
- retry uniquement sur opérations sûres/idempotentes ;
- dégradation contrôlée si carte, notification ou paiement est indisponible ;
- aucune requête N+1 ;
- budgets de bundle et de taille d’image en CI.

# 25. Observabilité et exploitation

## 25.1 Trois signaux

- logs structurés avec `requestId`, `userId` pseudonymisé, tenant, domaine et durée ;
- métriques : débit, erreurs, latence, saturation, files, paiements et webhooks ;
- traces distribuées pour commande et paiement.

## 25.2 Alertes prioritaires

- hausse des paiements en échec ;
- webhook non traité ;
- file bloquée ;
- erreurs 5xx ;
- latence élevée ;
- sauvegarde échouée ;
- stock d’OTP ou SMS anormal ;
- différence de rapprochement ;
- crash mobile après release.

Chaque alerte possède un runbook, un niveau de gravité, un propriétaire et une condition de clôture.

# 26. Environnements et configuration

Environnements séparés : local, test CI, staging et production. Bases, stockages, clés, fournisseurs et comptes sont distincts.

Variables principales :

```text
NODE_ENV
APP_ENV
API_BASE_URL
DATABASE_URL
REDIS_URL
S3_ENDPOINT
S3_BUCKET
S3_REGION
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
JWT_ISSUER
JWT_AUDIENCE
JWT_PRIVATE_KEY
PAYMENT_PROVIDER
PAYMENT_WEBHOOK_SECRET
MAP_TILES_URL
MAP_API_KEY
SENTRY_DSN
OTEL_EXPORTER_OTLP_ENDPOINT
EXPO_PUBLIC_API_URL
```

Seules les variables explicitement préfixées et non secrètes peuvent entrer dans les bundles clients. Fournir `.env.example` sans valeur réelle et valider la configuration au démarrage.

# 27. CI/CD et déploiement

## 27.1 Pipeline pull request

1. installation reproductible `pnpm install --frozen-lockfile` ;
2. format et lint ;
3. typecheck ;
4. tests unitaires et d’intégration ;
5. génération Prisma et OpenAPI ;
6. vérification migrations ;
7. build de toutes les applications affectées ;
8. scan secrets, dépendances et code ;
9. tests E2E essentiels ;
10. artefacts et rapport.

## 27.2 Production

- image Docker non-root et minimale ;
- migrations en étape contrôlée ;
- stratégie rolling ou blue/green ;
- health checks readiness/liveness ;
- rollback applicatif indépendant de la migration lorsque possible ;
- feature flags pour fonctions risquées ;
- release notes ;
- sauvegarde vérifiée avant changement destructif ;
- EAS Build pour applications mobiles ;
- canal interne, preview, staging puis production ;
- mises à jour OTA uniquement pour code compatible avec le runtime natif et après test.

# 28. Stratégie de tests

## 28.1 Pyramide

- unitaires : prix, permissions, transitions, stock, crédits et règles ;
- intégration : API + PostgreSQL/Redis réels via conteneurs ;
- contrats : OpenAPI et adaptateurs fournisseurs ;
- composants : états visuels et accessibilité ;
- E2E web : Playwright ;
- E2E mobile : Maestro sur Android prioritaire ;
- performance : k6 ou équivalent ;
- sécurité : DAST staging et tests d’autorisation.

## 28.2 Scénarios obligatoires

1. deux clics sur Commander créent une seule commande ;
2. deux webhooks identiques créent un seul paiement ;
3. webhook reçu avant retour client met la commande au bon état ;
4. retour client sans webhook n’affiche pas paiement réussi ;
5. utilisateur d’un restaurant ne lit pas les données d’un autre ;
6. module stock désactivé ne produit aucun écran ni blocage ;
7. commande hors ligne se synchronise une fois ;
8. prix modifié après commande ne change pas l’historique ;
9. remboursement supérieur au capturé est refusé ;
10. rôle cuisine ne voit pas la marge ;
11. avis sans expérience vérifiée est refusé ou non marqué vérifié ;
12. image invalide ou trop lourde est rejetée ;
13. heure d’Abidjan correcte autour des dates ;
14. total FCFA exact avec remise et frais ;
15. suppression de compte anonymise sans casser l’historique financier.

## 28.3 Critères de sortie

- aucune erreur critique ou haute connue ;
- tests métier critiques à 100 % sur branches principales ;
- couverture globale indicative ≥ 80 %, sans poursuivre le chiffre au détriment de la qualité ;
- aucune vulnérabilité critique connue ;
- migrations testées sur copie représentative anonymisée ;
- parcours commande/paiement testés sur appareil Android réel ;
- accessibilité et connexion lente vérifiées.

# 29. Analytics produit

Événements sans donnée sensible :

- `restaurant_viewed`, `search_performed`, `filter_applied` ;
- `product_viewed`, `cart_item_added`, `checkout_started` ;
- `order_created`, `payment_started`, `payment_succeeded`, `order_completed` ;
- `reservation_created`, `review_submitted` ;
- `merchant_order_accepted`, `expense_created`, `report_viewed` ;
- `module_enabled`, `subscription_started`, `subscription_cancelled`.

Chaque événement a un propriétaire, un schéma versionné et une finalité. Ne jamais envoyer nom, téléphone, adresse précise ou texte libre à l’outil analytics par défaut.

# 30. Modules, offres et entitlements

L’accès fonctionnel est calculé par le serveur : plan + modules + période + essai + suspension + override administratif audité. Le mobile reçoit un objet d’entitlements et construit sa navigation. Il ne doit pas coder en dur les offres commerciales.

Exemples :

```text
storefront.basic
catalog.advanced
orders.marketplace
orders.manual
reservations.tables
payments.online
cash.register
finance.expenses
finance.credits
inventory.simple
inventory.ingredients
delivery.internal
marketing.promotions
analytics.advanced
organization.multisite
```

Une désactivation d’abonnement conserve les données, bloque les nouvelles opérations concernées et offre export/lecture selon la politique commerciale.

# 31. Administration et actions sensibles

- aucun compte administrateur partagé ;
- MFA obligatoire ;
- recherche limitée et justifiée ;
- masquage des données personnelles ;
- élévation temporaire pour actions sensibles ;
- remboursement et modification de paiement audités ;
- impersonation interdite par défaut ; si ajoutée, bannière visible, durée courte, consentement/support et audit ;
- exports filigranés, limités et expirants ;
- suppression d’audit interdite.

# 32. Séquence d’implémentation recommandée

Cette séquence est technique ; elle ne constitue pas une date commerciale.

## Fondation

- création des cinq dépôts, CI indépendante, environnements et observabilité ;
- design tokens et composants essentiels ;
- identité, sessions, rôles et tenants ;
- organisation, établissement, horaires et catalogue ;
- OpenAPI, client généré et conventions d’erreur.

## Flux commercial essentiel

- découverte, fiche, panier et commande ;
- application restaurant et traitement de commande ;
- caisse/dépense simple ;
- notifications ;
- administration minimale ;
- paiement sandbox et idempotence.

## Capacités modulaires

- réservation ;
- stock simple ;
- avis vérifiés ;
- événements et promotions ;
- livraison interne ;
- crédits, dettes et rapports avancés.

## Extension

- ingrédients/recettes ;
- multi-sites ;
- partenaires logistiques ;
- fidélité ;
- publicité encadrée ;
- API partenaires.

Aucun agent ne doit commencer dix domaines simultanément. Chaque tranche doit produire un parcours vertical démontrable, testé et documenté.

# 33. Definition of Ready

Une tâche est prête si elle comporte :

- problème utilisateur ;
- acteur et permission ;
- préconditions ;
- parcours nominal ;
- cas limites ;
- règles métier ;
- données et API concernées ;
- maquette ou référence design si visuelle ;
- critères d’acceptation testables ;
- implications sécurité, hors ligne, analytics et accessibilité ;
- éléments explicitement hors périmètre.

# 34. Definition of Done

Une tâche n’est terminée que si :

- code typé, lisible et conforme à l’architecture ;
- migrations et données de seed présentes si nécessaire ;
- autorisations serveur testées ;
- erreurs, chargement, vide et hors ligne traités ;
- tests unitaires/intégration/E2E adaptés réussis ;
- OpenAPI et client mis à jour ;
- logs et métriques ajoutés pour flux critique ;
- UI conforme aux tokens et accessible ;
- aucune donnée sensible journalisée ;
- documentation et ADR mises à jour ;
- build de production réussi ;
- revue effectuée ;
- aucun TODO critique caché.

# 35. Contrat de travail pour l’agent IA

## 35.1 Instructions impératives

L’agent DOIT :

1. lire ce document, le cahier des charges et la charte avant de coder ;
2. identifier le dépôt actuellement ouvert, inspecter ses conventions et ses changements non commités ;
3. proposer ou mettre à jour un plan court avant une fonctionnalité complexe ;
4. implémenter une tranche verticale à la fois ;
5. réutiliser les packages et composants existants ;
6. conserver TypeScript strict et ne pas introduire `any` par facilité ;
7. créer migrations, tests et documentation dans la même tâche ;
8. vérifier l’autorisation serveur pour chaque objet ;
9. traiter chargement, vide, erreur et hors ligne ;
10. exécuter les tests pertinents et rapporter les résultats exacts ;
11. demander une décision si une ambiguïté modifie prix, paiement, données, droits ou expérience ;
12. préserver les changements existants d’Emmanuel ;
13. ne jamais déployer, payer, supprimer des données ou contacter un service externe sans autorisation ;
14. ne jamais prétendre qu’un test a réussi s’il n’a pas été exécuté.

## 35.2 Interdictions

L’agent ne doit pas :

- réécrire l’architecture sans ADR validée ;
- créer un microservice pour chaque domaine ;
- inventer des tarifs, partenaires ou contrats ;
- exposer un secret dans le code ;
- contourner une erreur de typage par `any`, `@ts-ignore` ou désactivation de lint sans justification ;
- utiliser une fausse donnée en production ;
- faire confiance aux montants, rôles ou tenant transmis par le client ;
- supprimer une migration appliquée ;
- modifier le logo ou les couleurs ;
- considérer le paiement réussi depuis un écran de retour ;
- livrer une fonctionnalité financière sans idempotence et audit ;
- utiliser du texte codé en dur dans les composants publics ;
- fusionner plusieurs bibliothèques UI concurrentes.

## 35.3 Format de compte rendu attendu

```text
Objectif traité
Fichiers modifiés
Décisions techniques
Règles métier appliquées
Tests exécutés et résultats
Migrations/configuration
Risques ou limites restantes
Prochaine tranche recommandée
```

## 35.4 Prompt de démarrage à fournir avec ce fichier

```text
Tu développes OnMangeOù. Lis intégralement la spécification technique maître,
le cahier des charges et la charte graphique avant toute modification.
Considère la spécification comme normative. Identifie d’abord lequel des cinq
dépôts est ouvert, puis inspecte-le et indique :
1) ce qui existe réellement ; 2) les écarts avec la spécification ;
3) la plus petite tranche verticale à implémenter ; 4) les questions bloquantes.
Ne génère pas toute l’application en une fois. N’invente aucune règle commerciale,
aucun tarif, aucun partenaire et aucun secret. Pour chaque tranche, implémente
le code, les migrations, les tests, l’OpenAPI et la documentation, puis exécute
les vérifications avant de rendre compte.
```

# 36. Décisions à confirmer avant branchement réel

Ces points restent volontairement configurables :

- fournisseur d’hébergement ;
- agrégateur final pour Wave et Mobile Money ;
- fournisseur SMS/WhatsApp ;
- fournisseur de cartes, tuiles et géocodage ;
- domaine officiel et adresses e-mail ;
- politique exacte d’annulation et remboursement ;
- barème définitif d’abonnement et commissions ;
- documents exigés pour vérifier un restaurant ;
- durées juridiques de conservation ;
- niveau de support et horaires ;
- seuils de double validation ;
- zones géographiques effectivement ouvertes.

Ces paramètres ne doivent pas bloquer le développement : utiliser interfaces, configuration, sandbox et données de démonstration clairement identifiées.

# 37. Checklist de conformité avant première production

## Produit

- parcours client et restaurant validés ;
- modules réellement masqués ;
- contenus français relus ;
- états vides, erreur et hors connexion présents ;
- appareil Android moyen testé.

## Technique

- migrations, sauvegarde et restauration testées ;
- OpenAPI publiée ;
- rate limits ;
- idempotence commande/paiement ;
- webhooks signés ;
- jobs et retries surveillés ;
- alertes et runbooks ;
- rollback testé.

## Sécurité et données

- revue des permissions ;
- MFA administration ;
- secrets hors dépôt ;
- scan de vulnérabilités ;
- pentest ;
- politiques et consentements versionnés ;
- export/suppression de compte ;
- sous-traitants recensés.

## Opérations

- support et escalade ;
- rapprochement paiement ;
- procédure remboursement ;
- gestion incident ;
- responsables d’alerte ;
- comptes et accès nominatifs.

# 38. Sources techniques officielles

- Next.js App Router : https://nextjs.org/docs/app
- Expo SDK : https://docs.expo.dev/versions/latest/
- Expo New Architecture : https://docs.expo.dev/guides/new-architecture/
- Node.js releases : https://nodejs.org/en/about/previous-releases
- NestJS : https://docs.nestjs.com/
- NestJS OpenAPI : https://docs.nestjs.com/openapi/introduction
- Prisma ORM : https://www.prisma.io/docs/orm
- PostgreSQL : https://www.postgresql.org/docs/current/
- PostGIS : https://postgis.net/docs/
- OWASP Top 10:2025 : https://owasp.org/Top10/2025/
- OWASP API Security Top 10:2023 : https://owasp.org/API-Security/editions/2023/en/0x11-t10/

Les versions mentionnées correspondent aux documentations consultées en août 2026. Avant initialisation de chaque dépôt, vérifier la compatibilité exacte entre Node, Nest, Expo, React Native et les bibliothèques natives concernées, puis verrouiller le résultat dans le lockfile de ce dépôt.

---

**Propriété du projet : Emmanuel Kouame**  
**Document confidentiel - OnMangeOù**
