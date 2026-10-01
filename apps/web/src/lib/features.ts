/**
 * Fonctions coupées le temps qu'elles aient de quoi tourner.
 *
 * Une constante plutôt qu'une variable d'environnement : l'interrupteur est lu
 * aussi bien par des composants client que par des routes, et une constante
 * est la seule valeur que les deux voient sans passer par le serveur.
 */

/**
 * Reconnaissance d'aliments par photo (FR-17).
 *
 * Coupée le 01/10/2026 : chaque photo coûte un appel au modèle de vision, et
 * le projet n'a pas de quoi avancer ces appels tant que l'abonnement ne les
 * finance pas. Le code reste entier et vérifié (`npm run verify`) : le
 * rallumer ne demande que de passer cette valeur à `true`, avec une clé et des
 * crédits chez le fournisseur.
 */
export const PHOTO_RECOGNITION_ENABLED = false;
