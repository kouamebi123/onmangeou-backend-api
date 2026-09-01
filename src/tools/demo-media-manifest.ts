/** Generated illustrations for these seed fixtures only, never arbitrary businesses. */
export const DEMO_SLUGS = [
  'chez-tante-marie-cocody-angre',
  'maquis-du-plateau-centre',
  'maquis-gaston-tardif-rennes',
  'chez-awa-beauregard-rennes',
  'attieke-republique-rennes',
  'le-thabor-braise-rennes',
  'grillades-du-colombier-rennes',
  'bar-ivoire-saint-helier-rennes',
  'alloco-night-cleunay-rennes',
  'riz-gras-maurepas-rennes',
  'cafe-bissap-jeanne-darc-rennes',
  'pontchaillou-poulet-rennes',
] as const;

export const DEMO_COVER_IMAGES: Record<string, string> = {
  'chez-tante-marie-cocody-angre': 'cover-tante',
  'maquis-du-plateau-centre': 'cover-plateau',
  'maquis-gaston-tardif-rennes': 'cover-gaston',
  'chez-awa-beauregard-rennes': 'cover-awa',
  'attieke-republique-rennes': 'cover-republique',
  'le-thabor-braise-rennes': 'cover-thabor',
  'grillades-du-colombier-rennes': 'cover-colombier',
  'bar-ivoire-saint-helier-rennes': 'cover-bar',
  'alloco-night-cleunay-rennes': 'cover-cleunay',
  'riz-gras-maurepas-rennes': 'cover-maurepas',
  'cafe-bissap-jeanne-darc-rennes': 'cover-bissap',
  'pontchaillou-poulet-rennes': 'cover-pontchaillou',
};

export const DEMO_DISH_IMAGES: Record<string, string> = {
  'Poulet braise entier': 'poulet-entier',
  'Poulet braisé attiéké': 'poulet-attieke',
  'Poisson braise (bar)': 'poisson',
  'Poisson braisé alloco': 'poisson',
  'Kedjenou de poulet': 'kedjenou',
  'Garba thon': 'garba',
  'Brochettes de bœuf': 'brochettes',
  'Alloco fromage': 'alloco-fromage',
  'Alloco nuit': 'alloco',
  'Riz gras au poulet': 'riz',
  'Riz sauce graine': 'sauce-graine',
  'Bissap maison': 'bissap',
  'Pizza attiéké poulet': 'pizza-attieke',
};

export function isReplaceableDemoImage(url: string | null): boolean {
  if (!url) return true;
  try {
    return new URL(url).hostname === 'images.unsplash.com';
  } catch {
    return false;
  }
}
