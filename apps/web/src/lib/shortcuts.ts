/**
 * Construction des raccourcis de quantité (FR-9).
 *
 * Une seule fonction pour les quatre chemins d'ajout : ad hoc, scan, recherche
 * et reconnaissance photo. Sans elle, chaque écran redéfinirait son propre
 * ordre et l'utilisateur verrait les puces bouger d'un chemin à l'autre.
 *
 * Ordre fixe (EXPERIENCE.md, motifs de composants) :
 *   1. la portion de référence, quand le produit en déclare une
 *   2. les deux dernières quantités distinctes, la plus récente d'abord
 *   3. 100 g, toujours proposé
 *
 * Les doublons sont éliminés en gardant la première occurrence, de sorte
 * qu'une quantité déjà proposée comme portion ne réapparaisse pas plus bas.
 */

export interface QuantityShortcut {
  label: string;
  grams: number;
}

/** Nombre maximal de quantités récentes proposées (FR-9). */
export const MAX_RECENT_SHORTCUTS = 2;

export function buildQuantityShortcuts({
  servingSizeG,
  recentQuantities,
}: {
  servingSizeG?: number | null;
  recentQuantities?: readonly number[];
}): QuantityShortcut[] {
  const shortcuts: QuantityShortcut[] = [];
  const seen = new Set<number>();

  function push(shortcut: QuantityShortcut) {
    if (!Number.isFinite(shortcut.grams) || shortcut.grams <= 0 || seen.has(shortcut.grams)) {
      return;
    }
    seen.add(shortcut.grams);
    shortcuts.push(shortcut);
  }

  if (typeof servingSizeG === 'number' && servingSizeG > 0) {
    const grams = Math.round(servingSizeG);
    push({ label: `Portion (${grams} g)`, grams });
  }

  for (const grams of (recentQuantities ?? []).slice(0, MAX_RECENT_SHORTCUTS)) {
    push({ label: `${grams} g`, grams });
  }

  push({ label: '100 g', grams: 100 });

  return shortcuts;
}
