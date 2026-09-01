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
