/**
 * Modération de la Communauté : le vocabulaire commun. Fonctions et types purs
 * (AD-8), sans base ni réseau, pour que tout ce qui décide se teste seul.
 *
 * Le système suit un ordre fixe, et chaque étape ne fait que la sienne :
 * normaliser, détecter (règles locales, liens), contextualiser, noter le
 * risque, appliquer la politique, agir, tracer. Aucune IA : la détection est
 * locale, et un détecteur, quel qu'il soit, ne fait que classer. C'est le
 * moteur de politique, déterministe et versionné, qui décide (`policy.ts`).
 */

/** Les catégories d'abus. `minor_safety` est la seule à court-circuiter tous les paliers. */
export const MODERATION_CATEGORIES = [
  'harassment',
  'hate',
  'threat',
  'sexual',
  'minor_safety',
  'spam',
  'scam',
  'self_promotion',
  'self_harm',
  'illegal',
] as const;

export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number];

/** Gravité propre à ce qui a été détecté, indépendamment de la confiance. */
export const SEVERITIES = ['low', 'medium', 'high', 'severe', 'critical'] as const;

export type Severity = (typeof SEVERITIES)[number];

/** Niveau de risque, lu dans le score normalisé (seuils dans `config.ts`). */
export const RISK_LEVELS = ['safe', 'low', 'medium', 'high', 'severe', 'critical'] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

/**
 * L'échelle des actions, de la plus légère à la plus lourde. L'ordre compte :
 * le plafond de l'automatique (`AUTO_ACTION_CEILING`) se lit sur cet ordre.
 *
 * `temporary_mute` est gardé pour l'échelle commune, mais n'a pas de sens ici
 * tant qu'il n'existe pas de messagerie : la politique ne l'émet pas.
 */
export const MODERATION_ACTIONS = [
  'no_action',
  'soft_warning',
  'content_review',
  'content_hidden',
  'content_removed',
  'temporary_restriction',
  'temporary_mute',
  'long_restriction',
  'account_suspension',
  'permanent_ban',
] as const;

export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export function actionRank(action: ModerationAction): number {
  return MODERATION_ACTIONS.indexOf(action);
}

/** P0 (critique) à P4 (faible) : l'ordre de la file humaine. */
export type Priority = 0 | 1 | 2 | 3 | 4;

/** Statuts d'un dossier, et d'un signalement, qui suit son dossier. */
export const CASE_STATUSES = [
  'open',
  'triaged',
  'under_review',
  'action_taken',
  'dismissed',
  'appealed',
  'resolved',
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

/** Les statuts d'un dossier encore à traiter : un seul dossier ouvert par cible. */
export const OPEN_CASE_STATUSES = ['open', 'triaged', 'under_review', 'appealed'] as const;

export const REPORT_STATUSES = CASE_STATUSES;

export type ReportStatus = CaseStatus;

/**
 * Ce sur quoi porte un dossier.
 *
 * - `user` : une personne, son pseudo et son nom affiché compris ;
 * - `session` : une séance partagée, signalée ;
 * - `template_name` : le nom d'une séance, tel que le fil le montre ;
 * - `exercise_name` : un exercice saisi à l'import, que le catalogue commun montre à tous.
 */
export const TARGET_KINDS = ['user', 'session', 'template_name', 'exercise_name'] as const;

export type TargetKind = (typeof TARGET_KINDS)[number];

/** Les sanctions enregistrées. `strike` compte sans rien restreindre. */
export const SANCTION_KINDS = ['strike', 'warning', 'restriction', 'suspension', 'ban'] as const;

export type SanctionKind = (typeof SANCTION_KINDS)[number];

/** Drapeaux d'un dossier, pour la file humaine. */
export const CASE_FLAGS = [
  'COORDINATED_REPORTING',
  'BAN_EVASION_SUSPECTED',
  'RECIDIVISM',
  'EVASION',
  'CRITICAL_SAFETY',
  'SELF_HARM_SUPPORT',
  'REPORTS_ONLY',
] as const;

export type CaseFlag = (typeof CASE_FLAGS)[number];

/** D'où vient une détection. */
export type DetectionSource = 'rules' | 'links' | 'reports' | 'history';

/** Une détection : ce qu'une source croit avoir vu, et avec quelle confiance. */
export interface Detection {
  source: DetectionSource;
  category: ModerationCategory;
  severity: Severity;
  /** 0 à 1. */
  confidence: number;
  /** Signaux nommés, jamais le texte : ils finissent dans l'audit. */
  signals: string[];
}

export function isModerationCategory(value: unknown): value is ModerationCategory {
  return typeof value === 'string' && (MODERATION_CATEGORIES as readonly string[]).includes(value);
}

export function isSeverity(value: unknown): value is Severity {
  return typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value);
}

export function severityRank(severity: Severity): number {
  return SEVERITIES.indexOf(severity);
}

export function levelRank(level: RiskLevel): number {
  return RISK_LEVELS.indexOf(level);
}

/** Borne un nombre entre 0 et 1, arrondi au millième comme en base. */
export function unit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;
}
