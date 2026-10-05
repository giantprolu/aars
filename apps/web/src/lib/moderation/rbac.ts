/**
 * Rôles et permissions de la modération.
 *
 * Aujourd'hui, une seule personne modère, par le tableau de bord, avec le
 * rôle `admin`. Les rôles sont pourtant écrits dès maintenant, et chaque
 * route vérifie la permission du geste plutôt que la seule présence de la
 * clé : ajouter un modérateur ne demandera que de lui donner un rôle, sans
 * relire chaque route.
 *
 * La politique elle-même (`config.ts`) ne se change par aucune route : elle
 * passe par un commit et un déploiement, ce que `policy.change` désigne.
 */

export const MODERATION_ROLES = [
  'user',
  'trusted_user',
  'moderator',
  'senior_moderator',
  'admin',
  'trust_and_safety_admin',
] as const;

export type ModerationRole = (typeof MODERATION_ROLES)[number];

export const PERMISSIONS = [
  /** Lire la file et les indicateurs. */
  'queue.read',
  /** Ouvrir un dossier, ses signaux et son historique. */
  'case.read',
  /** Voir le texte en cause d'un dossier, y compris le plus sensible. */
  'case.content',
  /** Prendre en charge, confirmer ou classer un dossier ; masquer ou restaurer un contenu. */
  'case.decide',
  /** Avertir et restreindre. */
  'sanction.restrict',
  /** Suspendre, et réinitialiser l'identité de quelqu'un. */
  'sanction.suspend',
  /** Bannir de la Communauté. */
  'sanction.ban',
  /** Lever une sanction, annuler un strike. */
  'sanction.lift',
  /** Changer la politique (par un commit, jamais par une route). */
  'policy.change',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MODERATOR: readonly Permission[] = ['queue.read', 'case.read', 'case.content', 'case.decide', 'sanction.restrict'];
const SENIOR: readonly Permission[] = [...MODERATOR, 'sanction.suspend', 'sanction.lift'];

export const GRANTS: Record<ModerationRole, readonly Permission[]> = {
  user: [],
  trusted_user: [],
  moderator: MODERATOR,
  senior_moderator: SENIOR,
  admin: [...SENIOR, 'sanction.ban', 'policy.change'],
  trust_and_safety_admin: PERMISSIONS,
};

export function can(role: ModerationRole, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}
