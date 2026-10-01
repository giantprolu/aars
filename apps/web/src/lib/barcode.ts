/**
 * Validation d'un code-barres. Module pur, sans dépendance (AD-8).
 *
 * Séparé du scanner, qui charge le décodeur WebAssembly dès son import : la
 * frontière HTTP doit pouvoir contrôler un code-barres sans embarquer un
 * binaire de décodage d'images dans une fonction serveur.
 */

/** Un code-barres exploitable : 8, 12 ou 13 chiffres (FR-16). */
export function isValidBarcode(value: string): boolean {
  return /^\d{8}$|^\d{12}$|^\d{13}$/.test(value);
}
