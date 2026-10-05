/** Les réponses de `/api/admin/*` (apps/web/src/server/db/queries/admin.ts). */

export interface Overview {
  accounts: { total: number; new7: number; new30: number };
  active: { today: number; d7: number; d30: number };
  recipes: { total: number; fromCatalog: number; own: number; ownWithoutPhoto: number };
  plannedThisWeek: number;
  openReports: number;
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
}

export interface Report {
  id: number;
  reason: string;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reportedId: number;
  reportedHandle: string | null;
  reporterHandle: string | null;
  sessionId: number | null;
  sessionName: string | null;
  sessionVisibility: string | null;
  openOnPerson: number;
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
