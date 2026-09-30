/**
 * Partage des séances : types et règles pures (AD-8).
 *
 * Trois règles tiennent tout le module, et les trois protègent la personne
 * qui s'entraîne plutôt que celle qui regarde :
 *
 * - on ne voit que ceux qu'on suit, et suivre se demande ;
 * - une séance est privée tant qu'on ne l'a pas partagée, une par une ;
 * - rien du corps ne se partage : ni poids, ni journal, ni cible. Une séance
 *   dit ce qu'on a soulevé, pas ce qu'on pèse.
 */

export const SESSION_VISIBILITIES = ['private', 'summary', 'detailed'] as const;

export type SessionVisibility = (typeof SESSION_VISIBILITIES)[number];

export function isSessionVisibility(value: unknown): value is SessionVisibility {
  return (
    typeof value === 'string' && (SESSION_VISIBILITIES as readonly string[]).includes(value)
  );
}

export const VISIBILITY_LABELS: Record<SessionVisibility, string> = {
  private: 'Privée',
  summary: 'Résumé',
  detailed: 'Détail',
};

export const VISIBILITY_NOTES: Record<SessionVisibility, string> = {
  private: 'Toi seul la vois.',
  summary: 'Tes abonnés voient le nom, la durée, le volume et le nombre de séries.',
  detailed: 'Tes abonnés voient aussi chaque exercice, ses séries et ses charges.',
};

/** Bornes d'un identifiant : court à taper, assez long pour être unique. */
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
export const DISPLAY_NAME_MAX = 40;

const HANDLE_PATTERN = /^[a-z0-9_]+$/;

/**
 * La forme stockée d'un identifiant : sans arobase, sans espace, en minuscules.
 *
 * Les majuscules sont ramenées plutôt que refusées : « @Camille » et
 * « @camille » désignent la même personne pour qui les tape, et deux comptes
 * qui ne diffèrent que par la casse seraient une porte ouverte à l'usurpation.
 */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

/** Vrai si l'identifiant, déjà normalisé, est acceptable. */
export function isValidHandle(handle: string): boolean {
  return (
    handle.length >= HANDLE_MIN && handle.length <= HANDLE_MAX && HANDLE_PATTERN.test(handle)
  );
}

/** Le nom affiché, nettoyé, ou `null` s'il est vide. */
export function cleanDisplayName(raw: string | null): string | null {
  const cleaned = (raw ?? '').trim().replace(/\s+/g, ' ').slice(0, DISPLAY_NAME_MAX);
  return cleaned === '' ? null : cleaned;
}

/** Une personne telle qu'un autre compte la voit. Jamais d'adresse. */
export interface PublicPerson {
  id: number;
  handle: string;
  displayName: string | null;
}

/** Le nom à montrer : le nom choisi, sinon l'identifiant. */
export function personLabel(person: Pick<PublicPerson, 'handle' | 'displayName'>): string {
  return person.displayName ?? `@${person.handle}`;
}

/** Ce que je sais de ma relation avec quelqu'un, vu de mon côté. */
export type FollowState = 'none' | 'requested' | 'following';

/** Un exercice d'une séance partagée en détail, résumé à ce qui se lit. */
export interface SharedExercise {
  name: string;
  sets: { weightKg: number | null; reps: number | null; seconds: number | null }[];
}

/** Une séance telle qu'elle paraît dans le fil. */
export interface FeedSession {
  id: number;
  author: PublicPerson;
  name: string;
  sessionDate: string;
  /** Début de la séance, en ISO 8601 : l'heure se lit dans le fil. */
  startedAt: string;
  durationSeconds: number | null;
  volumeKg: number;
  setCount: number;
  visibility: Exclude<SessionVisibility, 'private'>;
  /** Vide pour une séance partagée en résumé. */
  exercises: SharedExercise[];
  kudos: number;
  kudoedByMe: boolean;
  /** Vrai pour mes propres séances, qui figurent aussi dans le fil. */
  mine: boolean;
}

/**
 * Deux initiales pour un avatar : « Camille Lefort » donne « CL », « Camille »
 * donne « CA », un identifiant « camille_s » donne « CA ». `?` sans rien.
 */
export function initialsOf(label: string | null): string {
  const words = (label ?? '')
    .replace(/^@/, '')
    .split(/[\s_.-]+/)
    .filter((word) => word !== '');
  if (words.length === 0) {
    return '?';
  }
  const first = words[0] ?? '';
  const second = words[1];
  return (second === undefined ? first.slice(0, 2) : `${first[0] ?? ''}${second[0] ?? ''}`).toUpperCase();
}

/** Une ligne du classement de la semaine : qui, combien de séances terminées. */
export interface WeekBoardRow {
  person: PublicPerson;
  sessions: number;
  mine: boolean;
}

/** Les lavis des domaines, pour distinguer les avatars sans rien leur faire dire. */
const AVATAR_TONES = ['bg-protein-soft', 'bg-sport-soft', 'bg-cook-soft', 'bg-body-soft', 'bg-social-soft'];

/** Une teinte stable par personne : la même d'un écran à l'autre. */
export function avatarTone(id: number): string {
  return AVATAR_TONES[id % AVATAR_TONES.length] ?? 'bg-muted';
}
