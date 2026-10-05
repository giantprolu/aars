/**
 * La politique de modération, en un seul endroit.
 *
 * Tout ce qui décide d'une action se règle ici, et nulle part ailleurs : les
 * seuils de risque, la conduite par catégorie, l'échelle des strikes et leur
 * amortissement, le poids des signalements, les limites de fréquence, la durée
 * de conservation. Le code qui applique ces règles ne contient aucun chiffre.
 *
 * Pourquoi dans le code plutôt qu'en base : un changement de politique passe
 * alors par un commit relu, un déploiement et l'historique git, ce qui est la
 * protection la plus forte qu'on puisse lui donner à cette échelle. Chaque
 * décision enregistre `POLICY_VERSION` : on sait toujours sous quelle règle
 * elle a été prise. Changer une valeur ci-dessous, c'est changer la version.
 */

import type {
  ModerationAction,
  ModerationCategory,
  Priority,
  RiskLevel,
  SanctionKind,
  Severity,
} from './types';

export const POLICY_VERSION = '2026-10-05.1';

/**
 * Seuils du score de risque (0 à 1). Chaque niveau commence à sa valeur.
 * Ce ne sont pas des vérités : ils se recalent sur les taux d'appels gagnés
 * et de faux positifs que mesure le tableau de bord.
 */
export const RISK_THRESHOLDS: readonly { level: RiskLevel; from: number }[] = [
  { level: 'critical', from: 0.95 },
  { level: 'severe', from: 0.8 },
  { level: 'high', from: 0.6 },
  { level: 'medium', from: 0.4 },
  { level: 'low', from: 0.2 },
  { level: 'safe', from: 0 },
];

/** Ce que pèse une gravité dans le score de contenu : confiance × poids. */
export const SEVERITY_WEIGHT: Record<Severity, number> = {
  low: 0.35,
  medium: 0.55,
  high: 0.75,
  severe: 0.9,
  critical: 1,
};

/**
 * Les majorations du score. Elles aggravent un contenu déjà détecté ; aucune
 * ne crée de risque à partir de rien, sauf les signalements, plafonnés.
 */
export const RISK_MODIFIERS = {
  /** Par strike amorti de l'auteur, plafonné. */
  recidivismPerStrike: 0.1,
  recidivismCap: 0.3,
  /** Même catégorie, plusieurs fois dans la fenêtre : une série, pas un écart. */
  patternBonus: 0.15,
  patternCount: 3,
  patternWindowHours: 24,
  /** Le texte a été déguisé pour passer (caractères invisibles, homoglyphes…). */
  evasionBonus: 0.1,
  /** Compte de moins de `newAccountDays` jours. */
  newAccountBonus: 0.05,
  newAccountDays: 7,
  /** Par signal d'automate, plafonné. */
  botPerSignal: 0.05,
  botCap: 0.1,
  /**
   * Signalements : `perLog2 × log2(1 + poids crédible)`, plafonné à `cap`.
   * Le plafond tient sous le seuil MEDIUM : des signalements seuls, si
   * nombreux soient-ils, ouvrent une revue humaine et jamais une sanction.
   */
  reportsPerLog2: 0.1,
  reportsCap: 0.3,
  /** Une vague coordonnée ne compte plus que pour ce facteur. */
  coordinatedDamping: 0.25,
} as const;

/** La conduite à tenir pour une catégorie. */
export interface CategoryPolicy {
  /** Identifiant lisible, préfixe des politiques appliquées (`HARASSMENT_HIGH`). */
  id: string;
  /** À partir de ce niveau, un dossier part en revue humaine. */
  reviewFrom: RiskLevel;
  /** À partir de ce niveau, le contenu est masqué (ou refusé, s'il n'est pas encore montré). */
  hideFrom: RiskLevel;
  /** Sous cette confiance, rien n'est masqué automatiquement : revue seulement. */
  minConfidenceToHide: number;
  /** Le contenu masqué compte comme un strike pour son auteur. */
  strikes: boolean;
  /** Sous cette confiance, pas de strike même si le contenu est masqué. Par défaut, `minConfidenceToHide`. */
  minConfidenceToStrike?: number;
  /** Priorité dans la file, par niveau. Absent : la priorité par défaut (P4). */
  priority: Partial<Record<RiskLevel, Priority>>;
  /** Sanction minimale, dès ce niveau, quel que soit l'historique. L'action doit figurer dans `STRIKE_LADDER`. */
  sanctionFloor?: { from: RiskLevel; action: ModerationAction };
}

/**
 * La matrice catégorie → niveau → action.
 *
 * `minor_safety` est traité à part dans `policy.ts` : toute détection masque
 * et passe en P0, sans palier intermédiaire. `self_harm` ne donne jamais de
 * strike : une personne en détresse n'est pas une personne en faute.
 */
export const CATEGORY_POLICIES: Record<ModerationCategory, CategoryPolicy> = {
  harassment: {
    id: 'HARASSMENT',
    reviewFrom: 'medium',
    hideFrom: 'high',
    minConfidenceToHide: 0.7,
    strikes: true,
    priority: { medium: 3, high: 2, severe: 1, critical: 0 },
  },
  hate: {
    id: 'HATE',
    reviewFrom: 'low',
    hideFrom: 'medium',
    minConfidenceToHide: 0.7,
    strikes: true,
    priority: { low: 4, medium: 2, high: 2, severe: 1, critical: 0 },
  },
  threat: {
    id: 'THREAT',
    reviewFrom: 'low',
    hideFrom: 'high',
    minConfidenceToHide: 0.7,
    strikes: true,
    priority: { low: 3, medium: 2, high: 1, severe: 1, critical: 0 },
    sanctionFloor: { from: 'severe', action: 'long_restriction' },
  },
  sexual: {
    id: 'SEXUAL',
    reviewFrom: 'medium',
    hideFrom: 'high',
    minConfidenceToHide: 0.7,
    strikes: true,
    priority: { medium: 3, high: 2, severe: 2, critical: 1 },
  },
  minor_safety: {
    id: 'MINOR_SAFETY',
    reviewFrom: 'safe',
    hideFrom: 'safe',
    minConfidenceToHide: 0.4,
    strikes: true,
    // Masquer au moindre doute, mais ne sanctionner que sur un signal net :
    // « stop pédophilie » doit partir en revue, pas valoir une restriction.
    minConfidenceToStrike: 0.85,
    priority: { safe: 0, low: 0, medium: 0, high: 0, severe: 0, critical: 0 },
    sanctionFloor: { from: 'severe', action: 'long_restriction' },
  },
  spam: {
    id: 'SPAM',
    reviewFrom: 'medium',
    hideFrom: 'medium',
    minConfidenceToHide: 0.6,
    strikes: true,
    priority: { medium: 4, high: 3, severe: 3, critical: 3 },
  },
  scam: {
    id: 'SCAM',
    reviewFrom: 'medium',
    hideFrom: 'medium',
    minConfidenceToHide: 0.6,
    strikes: true,
    priority: { medium: 3, high: 2, severe: 2, critical: 1 },
  },
  self_promotion: {
    id: 'SELF_PROMOTION',
    reviewFrom: 'high',
    hideFrom: 'high',
    minConfidenceToHide: 0.6,
    strikes: false,
    priority: { high: 4, severe: 4, critical: 4 },
  },
  self_harm: {
    id: 'SELF_HARM',
    reviewFrom: 'low',
    hideFrom: 'high',
    minConfidenceToHide: 0.6,
    strikes: false,
    priority: { low: 3, medium: 2, high: 1, severe: 1, critical: 0 },
  },
  illegal: {
    id: 'ILLEGAL',
    reviewFrom: 'medium',
    hideFrom: 'medium',
    minConfidenceToHide: 0.7,
    strikes: true,
    priority: { medium: 3, high: 2, severe: 1, critical: 1 },
  },
};

/** Poids d'un strike selon la gravité de ce qui l'a valu. */
export const STRIKE_WEIGHT: Record<Severity, number> = {
  low: 0,
  medium: 0.5,
  high: 1,
  severe: 2,
  critical: 3,
};

/**
 * Un contenu refusé avant d'avoir été montré n'a blessé personne : son strike
 * compte moitié. Les essais suivants sur la même cible s'ajoutent au même
 * dossier sans nouveau strike : c'est à un humain de juger l'insistance.
 */
export const PRE_EXPOSURE_STRIKE_FACTOR = 0.5;

/** Un strike perd la moitié de son poids tous les `STRIKE_HALF_LIFE_DAYS` jours. */
export const STRIKE_HALF_LIFE_DAYS = 90;

/** L'échelle des sanctions, lue sur le total des strikes amortis (le plus haut palier atteint l'emporte). */
export const STRIKE_LADDER: readonly {
  from: number;
  action: ModerationAction;
  kind: SanctionKind;
  hours: number | null;
}[] = [
  { from: 6, action: 'permanent_ban', kind: 'ban', hours: null },
  { from: 4, action: 'account_suspension', kind: 'suspension', hours: 24 * 30 },
  { from: 3, action: 'long_restriction', kind: 'restriction', hours: 24 * 7 },
  { from: 2, action: 'temporary_restriction', kind: 'restriction', hours: 24 },
  { from: 1, action: 'soft_warning', kind: 'warning', hours: null },
];

/**
 * Le plus haut que l'automatique puisse aller. Au-delà, la sanction est
 * proposée dans le dossier et attend une décision humaine : jamais de
 * suspension ni de bannissement sur la seule foi d'un calcul.
 */
export const AUTO_ACTION_CEILING: ModerationAction = 'long_restriction';

/**
 * Le score de confiance interne d'un compte (0 à 1), jamais montré à
 * personne. Il ne sert qu'à deux choses : pondérer les signalements que ce
 * compte fait, et ordonner la file. Il ne décide d'aucune sanction.
 *
 * Chaque facteur est documenté dans `docs/MODERATION.md`. Aucun ne lit le
 * journal, le poids ou le profil : la santé de quelqu'un ne dit rien de sa
 * bonne foi, et ne doit pas pouvoir être retournée contre lui.
 */
export const TRUST_WEIGHTS = {
  base: 0.5,
  /** Gagné linéairement jusqu'à `ageFullDays` jours d'ancienneté. */
  age: 0.2,
  ageFullDays: 30,
  /** S'être présenté (pseudo choisi). */
  identity: 0.05,
  /** Abonnés acceptés, jusqu'à `followersFull` : d'autres ont choisi de le suivre. */
  followers: 0.1,
  followersFull: 5,
  /** Séances terminées et partagées, jusqu'à `sessionsFull`. */
  sessions: 0.05,
  sessionsFull: 10,
  /** Par signalement de sa part qui a mené à une action, plafonné. */
  confirmedReport: 0.05,
  confirmedReportCap: 0.15,
  /** Par signalement de sa part rejeté, plafonné. */
  dismissedReport: -0.1,
  dismissedReportCap: -0.3,
  /** Par signalement pris dans une vague coordonnée, plafonné. */
  coordinatedReport: -0.1,
  coordinatedReportCap: -0.3,
  /** Par strike amorti, plafonné. */
  strike: -0.15,
  strikeCap: -0.45,
} as const;

/** Le traitement des signalements et la détection des vagues coordonnées. */
export const REPORT_RULES = {
  /** Un compte de moins de ce nombre de jours signale à poids réduit. */
  youngReporterDays: 7,
  youngReporterFactor: 0.3,
  /** Fenêtre d'observation d'une vague sur une même cible. */
  brigadeWindowHours: 6,
  /** Nombre de personnes distinctes à partir duquel on regarde. */
  brigadeMinReporters: 3,
  /** Part de comptes récents ou peu fiables qui fait une vague. */
  brigadeSuspectShare: 0.6,
  /** Confiance sous laquelle un compte est « peu fiable » pour ce calcul. */
  lowTrust: 0.3,
  /** Notes identiques, une fois normalisées, à partir de ce nombre. */
  brigadeSameNote: 2,
  /**
   * Longueur minimale d'une note pour que son copier-coller compte : trois
   * personnes écrivent naturellement « pseudo raciste », pas la même phrase
   * de vingt caractères.
   */
  brigadeNoteMinLength: 20,
  /** Sous ce poids crédible total, un signalement seul reste en P4. */
  minWeightForReview: 0.3,
  /** À partir de ce poids crédible, la priorité monte d'un cran. */
  heavyWeight: 3,
} as const;

/** Une limite de fréquence : au plus `limit` fois par fenêtre de `windowSeconds`. */
export interface RateRule {
  limit: number;
  windowSeconds: number;
}

const HOUR = 3600;
const DAY = 24 * HOUR;

/** Les limites de fréquence, par geste. */
export const RATE_LIMITS = {
  /** Signalements faits par un compte. */
  reportsPerUser: { limit: 10, windowSeconds: DAY },
  /** Signalements d'un même compte visant une même personne. */
  reportsPerTarget: { limit: 3, windowSeconds: 30 * DAY },
  /** Demandes de suivi envoyées. */
  followsPerUser: { limit: 30, windowSeconds: DAY },
  /** Demandes répétées à une même personne : un refus efface la demande, pas l'insistance. */
  followsPerTarget: { limit: 3, windowSeconds: 30 * DAY },
  /** Changements de pseudo ou de nom affiché. */
  identityPerUser: { limit: 10, windowSeconds: DAY },
  /** Inscriptions depuis une même adresse IP (empreinte, jamais l'adresse). */
  signupsPerIpHour: { limit: 5, windowSeconds: HOUR },
  signupsPerIpDay: { limit: 20, windowSeconds: DAY },
} as const satisfies Record<string, RateRule>;

/**
 * Durées de conservation, en jours. À faire valider par un juriste : ce sont
 * des valeurs prudentes, pas des obligations vérifiées.
 *
 * Le journal d'audit ne peut pas descendre sous `AUDIT_MIN_DAYS` : la base
 * refuse d'effacer une ligne plus jeune (déclencheur de la migration 0026).
 */
export const RETENTION_DAYS = {
  /** Le texte conservé dans un dossier, après sa clôture. */
  caseSnapshot: 180,
  /** Les dossiers clos, avec leurs détections. */
  closedCase: 730,
  /** Les sanctions terminées ou levées. */
  endedSanction: 730,
  /** Les signalements clos. */
  closedReport: 365,
  /** Le journal d'audit. */
  audit: 730,
} as const;

export const AUDIT_MIN_DAYS = 365;

/** Le texte gardé dans un dossier, pour la revue et l'appel : un nom tient dedans. */
export const SNAPSHOT_MAX = 200;
