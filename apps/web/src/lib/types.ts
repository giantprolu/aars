/**
 * Types partagés entre le navigateur et le serveur.
 *
 * Ce module ne dépend que de `./meal`, qui ne dépend lui-même de rien : la
 * liste des repas contraint la colonne, le corps des requêtes et le sélecteur,
 * et devait donc vivre en un seul endroit (spine, tableau des couches).
 */

import type { Meal } from './meal';

/** Le quadruplet suivi par le produit, glossaire du PRD. */
export interface Macros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Origine d'une entrée. `manual` désigne une entrée ad hoc (FR-25). */
export type SourceKind = 'ciqual' | 'product' | 'manual';

/** Une ligne de journal. Ses macros sont figées (AD-1). */
export interface Entry {
  id: number;
  entryDate: string;
  /** Repas de rattachement, choisi à l'enregistrement. */
  meal: Meal;
  foodLabel: string;
  quantityG: number;
  macros: Macros;
  sourceKind: SourceKind;
  sourceRef: string | null;
}

/** Totaux d'un journal, sommés par Postgres (AD-9). */
export interface DayTotals {
  entryDate: string;
  macros: Macros;
  entryCount: number;
}

/** Une fiche nutritionnelle pour 100 g (AD-8). */
export interface ReferenceFood {
  kind: 'ciqual' | 'product';
  ref: string;
  name: string;
  per100g: Macros;
  /** Portion déclarée par Open Food Facts, en grammes, si connue. */
  servingSizeG: number | null;
}

/**
 * Où un résultat a été trouvé, ce que `kind` ne dit pas.
 *
 * `kind` est la nature de la fiche et décide de la colonne `source_kind` d'une
 * entrée. `origin` est le chemin par lequel elle est arrivée, et décide de deux
 * choses que `kind` ne saurait porter : l'étiquette affichée, et le fait qu'un
 * produit venu d'Open Food Facts doit être mis en cache avant d'être journalisé,
 * sans quoi sa référence ne pointerait vers rien.
 */
export type HitOrigin = 'ciqual' | 'cache' | 'off';

/** Un résultat de recherche, avec sa source affichable. */
export interface SearchHit extends ReferenceFood {
  similarity: number;
  origin: HitOrigin;
}

/** Forme d'erreur unique des routes serveur (spine, conventions). */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

export type ApiErrorCode =
  | 'unauthorized'
  | 'invalid_input'
  | 'email_taken'
  | 'not_found'
  | 'payload_too_large'
  | 'model_unavailable'
  | 'model_quota_exceeded'
  | 'model_bad_format'
  | 'upstream_unavailable'
  | 'internal';

/**
 * Résultat d'une résolution de code-barres auprès d'Open Food Facts.
 * Discriminé plutôt qu'exceptionnel (AD-12), et jamais déduit du code HTTP (AD-3).
 */
export type OffLookup =
  | { kind: 'found'; product: OffProduct }
  | { kind: 'incomplete'; partial: OffPartialProduct }
  | { kind: 'not_found' }
  | { kind: 'error'; reason: 'timeout' | 'network' | 'malformed' };

export interface OffProduct {
  barcode: string;
  name: string;
  per100g: Macros;
  servingSizeG: number | null;
}

export interface OffPartialProduct {
  barcode: string;
  name: string | null;
  per100g: Partial<Macros>;
  servingSizeG: number | null;
}

/** Résultat d'une tentative de décodage caméra (AD-12). */
export type ScanOutcome =
  | { kind: 'decoded'; barcode: string }
  | { kind: 'permission_denied' }
  | { kind: 'unsupported' }
  /** Flux ouvert mais aperçu refusé par le navigateur : relançable au toucher. */
  | { kind: 'stalled' }
  | { kind: 'aborted' };

/** Un candidat proposé pour un nom reconnu (FR-18). */
export interface Candidate extends SearchHit {
  /** Vrai quand ce candidat vient d'un alias déjà choisi (FR-19). */
  fromAlias: boolean;
}

/** Un nom reconnu par le modèle de vision, avec ses candidats. */
export interface RecognizedName {
  name: string;
  candidates: Candidate[];
}
