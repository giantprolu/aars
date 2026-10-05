/** Les réponses de `/api/admin/*` (apps/web/src/server/db/queries/admin.ts). */

export interface Overview {
  accounts: { total: number; new7: number; new30: number };
  active: { today: number; d7: number; d30: number };
  recipes: { total: number; fromCatalog: number; own: number; ownWithoutPhoto: number };
  plannedThisWeek: number;
  openReports: number;
  openCases: number;
  urgentCases: number;
  subscriptions: { active: number; kitchenPlus: number };
  salesOpen: boolean;
  today: string;
}

export interface UsagePoint {
  day: string;
  event: string;
  users: number;
  total: number;
}

export interface UsageResponse {
  today: string;
  days: number;
  points: UsagePoint[];
}

export interface AdminRecipe {
  id: number;
  name: string;
  servings: number;
  createdAt: string;
  imageUrl: string | null;
  meal: string | null;
  ingredients: string[];
}

export interface CatalogMeal {
  slug: string;
  goal: 'lose' | 'maintain' | 'gain';
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  position: number;
  name: string;
  imageUrl: string | null;
  estimateKcal: number;
  ingredients: string[];
}

export interface Passkey {
  id: string;
  publicKey: string;
  counter: number;
  transports: string[];
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export const MEAL_LABELS: Record<CatalogMeal['slot'], string> = {
  breakfast: 'Petit-déj',
  lunch: 'Déjeuner',
  dinner: 'Dîner',
  snack: 'Collation',
};

export const GOAL_LABELS: Record<CatalogMeal['goal'], string> = {
  lose: 'Perte',
  maintain: 'Maintien',
  gain: 'Prise de masse',
};

export const REASON_LABELS: Record<string, string> = {
  inappropriate: 'Contenu inapproprié',
  harassment: 'Harcèlement',
  spam: 'Spam ou faux compte',
  other: 'Autre',
};

export const EVENT_LABELS: Record<string, string> = {
  app_opened: 'Ouvertures',
  target_set: 'Objectifs fixés',
  activity_synced: 'Santé reçue',
  paywall_hit: 'Limites atteintes',
  meal_search: 'Repas par recherche',
  meal_barcode: 'Repas par code-barres',
  meal_photo: 'Repas par photo',
  meal_manual: 'Repas à la main',
  meal_recent: 'Repas récents',
  meal_favorite: 'Repas favoris',
  meal_recipe: 'Repas d\'une recette',
  meal_planned: 'Repas du plan',
};

/** Un dossier de modération dans la file (`/moderation/queue`). */
export interface CaseSummary {
  id: number;
  targetKind: string;
  targetId: number;
  category: string | null;
  severity: string | null;
  level: string;
  riskScore: number;
  priority: number;
  status: string;
  flags: string[];
  recommendedAction: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  subject: { id: number; handle: string | null; displayName: string | null };
  reports: number;
  version: string;
}

/** Un dossier entier (`/moderation/cases/:id`). */
export interface CaseView extends CaseSummary {
  explanation: Record<string, unknown>;
  contentSnapshot: string | null;
  resolution: string | null;
  policyVersion: string;
  subjectSince: string;
  target: { label: string | null; hidden: boolean; visibility: string | null };
  signals: { source: string; category: string | null; severity: string | null; confidence: number; signals: string[]; createdAt: string }[];
  reportList: {
    id: number;
    reason: string;
    note: string | null;
    weight: number | null;
    status: string | null;
    createdAt: string;
    reporterId: number;
    reporterHandle: string | null;
    reporterAgeDays: number;
  }[];
  sanctions: {
    id: number;
    caseId: number | null;
    kind: string;
    action: string;
    category: string | null;
    strikeWeight: number;
    startsAt: string;
    endsAt: string | null;
    liftedAt: string | null;
    liftedBy: string | null;
    voided: boolean;
    decidedBy: string;
    active: boolean;
  }[];
  audit: { id: number; at: string; actor: string; event: string; details: Record<string, unknown> }[];
  strikeTotal: number;
  allowed: string[];
}

export interface ModerationMetrics {
  days: number;
  openByPriority: { priority: number; count: number }[];
  openedByCategory: { category: string; count: number }[];
  opened: number;
  autoActions: number;
  confirmed: number;
  dismissed: number;
  autoReversed: number;
  meanResolutionHours: number | null;
  urgentShare: number | null;
  reports: { created: number; actionTaken: number; dismissed: number; coordinated: number; rateLimited: number };
  sanctions: { kind: string; system: number; human: number }[];
  active: { restriction: number; suspension: number; ban: number };
}

export const CATEGORY_LABELS: Record<string, string> = {
  harassment: 'Harcèlement',
  hate: 'Haine',
  threat: 'Menace',
  sexual: 'Sexuel',
  minor_safety: 'Mineurs',
  spam: 'Spam',
  scam: 'Arnaque',
  self_promotion: 'Publicité',
  self_harm: 'Auto-agression',
  illegal: 'Vente interdite',
};

export const TARGET_LABELS: Record<string, string> = {
  user: 'Pseudo et nom',
  session: 'Séance signalée',
  template_name: 'Nom de séance',
  exercise_name: 'Exercice importé',
};

export const STATUS_LABELS: Record<string, string> = {
  open: 'Ouvert',
  triaged: 'Trié',
  under_review: 'En cours',
  action_taken: 'Action prise',
  dismissed: 'Classé sans suite',
  appealed: 'En appel',
  resolved: 'Confirmé',
};

export const FLAG_LABELS: Record<string, string> = {
  COORDINATED_REPORTING: 'Vague coordonnée',
  BAN_EVASION_SUSPECTED: 'Retour d’un banni ?',
  RECIDIVISM: 'Récidive',
  EVASION: 'Contournement',
  CRITICAL_SAFETY: 'Sécurité critique',
  SELF_HARM_SUPPORT: 'Personne en détresse',
  REPORTS_ONLY: 'Signalements seuls',
};

export const ACTION_LABELS: Record<string, string> = {
  soft_warning: 'Avertissement',
  temporary_restriction: 'Restriction courte',
  long_restriction: 'Restriction longue',
  account_suspension: 'Suspension',
  permanent_ban: 'Bannissement',
  content_hidden: 'Contenu masqué',
  content_removed: 'Contenu refusé',
};

export const SANCTION_LABELS: Record<string, string> = {
  strike: 'Strike',
  warning: 'Avertissement',
  restriction: 'Restriction',
  suspension: 'Suspension',
  ban: 'Bannissement',
};

export const AUDIT_LABELS: Record<string, string> = {
  CASE_OPENED: 'Dossier ouvert',
  MODERATION_DETECTED: 'Détection',
  MODERATION_CLASSIFIED: 'Classement',
  CONTENT_HIDDEN: 'Contenu masqué',
  CONTENT_REMOVED: 'Contenu refusé',
  CONTENT_RESTORED: 'Contenu rétabli',
  STRIKE_RECORDED: 'Strike',
  WARNING_ISSUED: 'Avertissement',
  USER_RESTRICTED: 'Restriction',
  ACCOUNT_SUSPENDED: 'Suspension',
  ACCOUNT_BANNED: 'Bannissement',
  SANCTION_RECOMMENDED: 'Sanction proposée',
  SANCTION_LIFTED: 'Sanction levée',
  REPORT_CREATED: 'Signalement',
  REPORT_DISMISSED: 'Signalements rejetés',
  REPORT_RESOLVED: 'Signalement clos',
  COORDINATED_REPORTING_FLAGGED: 'Vague coordonnée',
  CASE_TAKEN: 'Pris en charge',
  CASE_RESOLVED: 'Confirmé',
  CASE_DISMISSED: 'Classé sans suite',
  IDENTITY_RESET: 'Identité réinitialisée',
};
