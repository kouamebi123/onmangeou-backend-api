/**
 * Generation de slugs pour les URLs publiques indexables (specification section 3.3).
 *
 * Le slug est stable une fois publie : une fiche partagee par lien ou QR code ne
 * doit pas devenir introuvable parce que le restaurant a corrige son nom.
 */

const MAX_SLUG_LENGTH = 160;

export function slugify(input: string): string {
  const normalized = input
    .normalize('NFD')
    // Retire les diacritiques : « Café Sénégalais » devient « cafe-senegalais ».
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH);

  return normalized.length > 0 ? normalized : 'restaurant';
}

/**
 * Ajoute un suffixe court en cas de collision.
 *
 * Un compteur incremental exposerait le nombre d'homonymes ; un suffixe aleatoire
 * court reste lisible sans reveler de volumetrie.
 */
export function withSlugSuffix(base: string, suffix: string): string {
  const trimmed = base.slice(0, MAX_SLUG_LENGTH - suffix.length - 1);
  return `${trimmed}-${suffix}`;
}
