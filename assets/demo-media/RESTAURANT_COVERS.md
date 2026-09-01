# Restaurant cover illustrations — v1

Twelve individually generated editorial illustrations created with the built-in image generator.
These are fictional demo venue illustrations, not authentic photographs of the establishments.
Format: landscape 3:2, 1200 × 800 WebP. No lettering, logos or people.
Every image has a unique SHA-256, checked by tests and by the importer.

## Art direction / prompt set

- Chez Tante Marie: warm Abidjan family courtyard, terracotta, grilled chicken and attieke.
- Maquis du Plateau: indigo urban night, string lights, charcoal grill and skewers.
- Maquis Gaston Tardif: cream and cobalt neighborhood bistro, chicken and attieke.
- Chez Awa Beauregard: sage homestyle dining room, earthenware kedjenou cocotte and alloco.
- Attieke Republique: turquoise contemporary lunch counter, attieke and fried tuna.
- Le Thabor Braise: leafy park-side terrace, grilled sea bass and plantain.
- Grillades du Colombier: brick and black-tile grill counter, beef skewers and takeaway tray.
- Bar d'Ivoire Saint-Helier: burgundy and walnut bar, alloco fromage and amber beer.
- Alloco Night Cleunay: plum late-night snack shop, fried plantain and warm magenta lighting.
- Riz Gras Maurepas: mustard neighborhood canteen, tomato rice and chicken.
- Cafe Bissap Jeanne d'Arc: blush daytime cafe, hibiscus and ginger drinks with pastries.
- Pontchaillou Poulet: orange contemporary chicken bistro, grilled chicken and chicken pizza.

## Associations

| Restaurant | File |
| --- | --- |
| Chez Tante Marie - Cocody Angre | cover-tante.webp |
| Maquis du Plateau | cover-plateau.webp |
| Maquis Gaston Tardif | cover-gaston.webp |
| Chez Awa Beauregard | cover-awa.webp |
| Attiéké République | cover-republique.webp |
| Le Thabor Braisé | cover-thabor.webp |
| Grillades du Colombier | cover-colombier.webp |
| Bar d’Ivoire Saint-Hélier | cover-bar.webp |
| Alloco Night Cleunay | cover-cleunay.webp |
| Riz Gras Maurepas | cover-maurepas.webp |
| Café Bissap Jeanne d’Arc | cover-bissap.webp |
| Pontchaillou Poulet | cover-pontchaillou.webp |

## One-shot production import

The exact IDs, slugs, approved previous URLs and checksums are in restaurant-covers-v1.json.
The importer changes only Establishment.coverImageUrl, never products, menus or merchant details.
It rejects a changed ID, slug, old URL or asset checksum and commits all cover updates in one transaction.
A durable restaurant-covers-v1-rollback.json receipt is written on the media volume before DB updates.
Old image files are retained. Re-execution checks the receipt and becomes a no-op after success.
Trigger only once using IMPORT_RESTAURANT_COVERS_ON_START=apply-v1; disable after verification.
The ordinary demo-media importer also uses the distinct covers for future fresh demo environments.
