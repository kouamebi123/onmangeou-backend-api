# Visuels de démonstration — OnMangeOù

Ces 13 images sont des illustrations générées par IA, pas des photographies
d'établissements réels. Ne pas les présenter comme des preuves de plats servis.

Créées avec l'outil de génération d'images intégré, puis encodées en WebP
(largeur 1200 px, qualité 84). Les associations exactes sont dans
`src/tools/demo-media-manifest.ts`. La couverture maquis est une ambiance
générique partagée entre les établissements fictifs.

Direction des prompts : photographie culinaire naturelle en paysage, table
en bois, lumière du jour, portion réaliste, plat entier visible, sans texte,
logo, personne ni collage. Sujets : poulet braisé attiéké ; poulet entier ;
garba au thon ; kedjenou ; poisson braisé alloco ; brochettes de bœuf ;
riz gras au poulet ; riz sauce graine ; alloco ; alloco fromage ;
pizza attiéké poulet ; bissap ; intérieur de maquis fictif.

## Import sur le serveur ayant accès au volume

Après construction avec `node scripts/bundle-api.cjs` :

```sh
node dist/import-demo-media.cjs
node dist/import-demo-media.cjs --apply
```

La première commande affiche le plan, sans modifier la base ni le stockage.
La seconde importe sur le stockage configuré et associe les URL en transaction.
Elle ne crée pas de restaurant, ne modifie ni prix ni commandes et ne remplace
que les anciennes images Unsplash ou les images absentes des fixtures connues.
Les photos téléversées par les commerçants sont préservées.

Un manifeste des anciennes/nouvelles URL est écrit dans MEDIA_LOCAL_ROOT avant
la transaction. Le relancement est idempotent. En cas d'écriture concurrente,
la transaction est annulée et les fichiers nouvellement créés sont supprimés.
Les anciens fichiers ne sont pas supprimés.

Sur Railway, exécuter dans le conteneur du backend où /data/uploads est monté,
pas dans une commande de pré-déploiement sans volume. L'import n'est pas lancé
automatiquement par un déploiement.
