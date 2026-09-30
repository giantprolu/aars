import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Compose des classes Tailwind, la dernière l'emportant en cas de conflit. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Lit un nombre saisi à la française ou à l'anglaise : « 0,5 » comme « 0.5 ».
 * Un champ vide donne `NaN`, pas zéro, pour qu'il reste distinct d'un vrai 0.
 *
 * Les champs décimaux sont en `type="text"` et passent par ici : un
 * `type="number"` sous iOS en français rend une valeur vide dès qu'on tape la
 * virgule, et le champ contrôlé l'efface aussitôt.
 */
export function parseDecimal(raw: string): number {
  const trimmed = raw.trim();
  return trimmed === '' ? Number.NaN : Number(trimmed.replace(',', '.'));
}
