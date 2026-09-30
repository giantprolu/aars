/**
 * Dates de journal, toujours calculées dans Europe/Paris (AD-11).
 *
 * Les fonctions Vercel tournent en UTC. Sans ce fuseau explicite, un repas
 * enregistré à 23 h 30 heure de Paris tomberait dans le journal du lendemain.
 * C'est le seul endroit du code autorisé à déterminer une date de journal.
 */

const JOURNAL_TIME_ZONE = 'Europe/Paris';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: JOURNAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** La date du jour au format `YYYY-MM-DD`, dans le fuseau du journal. */
export function todayInParis(now: Date = new Date()): string {
  return dateFormatter.format(now);
}

const hourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: JOURNAL_TIME_ZONE,
  hour: '2-digit',
  hour12: false,
});

/**
 * L'heure courante dans le fuseau du journal, de 0 à 23.
 *
 * Elle vit ici et non dans `@/lib/meal` pour la même raison que la date : les
 * fonctions Vercel tournent en UTC, et c'est le seul module autorisé à savoir
 * dans quel fuseau se lit une journée (AD-11).
 */
export function hourInParis(now: Date = new Date()): number {
  return Number(hourFormatter.format(now));
}

/** Vrai si la chaîne est une date `YYYY-MM-DD` réelle. */
export function isJournalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

const longDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** « mardi 10 septembre », pour les en-têtes de journal et d'historique. */
export function formatJournalDate(isoDate: string): string {
  return longDateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

/** « Aujourd'hui », « Hier », ou la date longue. */
export function formatRelativeJournalDate(
  isoDate: string,
  today: string = todayInParis(),
): string {
  if (isoDate === today) {
    return "Aujourd'hui";
  }
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (isoDate === yesterday.toISOString().slice(0, 10)) {
    return 'Hier';
  }
  return formatJournalDate(isoDate);
}

const monthFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});

/** « septembre 2026 », pour le surtitre de l'historique. */
export function formatMonthYear(isoDate: string): string {
  return monthFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * « 11 septembre 2026 », pour un horodatage technique et non une date de
 * journal : l'import CIQUAL de l'écran de réglages n'a pas de jour de repas.
 */
const stampFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: JOURNAL_TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function formatStampDate(value: Date): string {
  return stampFormatter.format(value);
}

/**
 * Âge en années révolues à partir d'une date de naissance `YYYY-MM-DD`.
 *
 * Comparé sur la date civile et non sur un nombre de millisecondes : diviser
 * un écart par la durée d'une année moyenne se trompe d'un jour autour des
 * anniversaires, et le métabolisme de base dépend de l'âge.
 */
export function ageInYears(birthDate: string, today: string = todayInParis()): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  const beforeBirthday = tm < bm || (tm === bm && td < bd);
  return ty - by - (beforeBirthday ? 1 : 0);
}

/**
 * Le lundi de la semaine où tombe `isoDate`.
 *
 * Le lundi et non le dimanche : c'est le premier jour de la semaine en France,
 * et surtout le jour où l'on décide de la semaine qui vient. Une semaine qui
 * commencerait un dimanche couperait le week-end en deux, alors que c'est
 * précisément là que se font les courses.
 *
 * Le calcul passe par UTC à midi plutôt qu'à minuit : une date de journal n'a
 * pas d'heure, et minuit UTC bascule d'un jour au moindre décalage de fuseau.
 */
export function startOfWeek(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  // getUTCDay rend 0 pour dimanche : le ramener à 6 place le lundi en tête.
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

/** Les jours d'une date à l'autre, bornes comprises, en ordre chronologique. */
export function daysFrom(startIsoDate: string, count: number): string[] {
  const days: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const date = new Date(`${startIsoDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    days.push(date.toISOString().slice(0, 10));
  }
  return days;
}

/** La date décalée de `days` jours, en avant ou en arrière. */
export function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const weekdayFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  weekday: 'long',
});

const dayMonthFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
});

/** « lundi », pour les en-têtes de jour du plan de la semaine. */
export function formatWeekday(isoDate: string): string {
  return weekdayFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

/** « 15 septembre », sans le nom du jour ni l'année. */
export function formatDayMonth(isoDate: string): string {
  return dayMonthFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * « du 15 au 21 septembre », ou « du 29 septembre au 5 octobre » quand la
 * semaine enjambe deux mois. Le mois n'est répété que s'il change : le
 * répéter systématiquement alourdirait un surtitre lu chaque jour.
 */
export function formatWeekRange(startIsoDate: string): string {
  const end = shiftDate(startIsoDate, 6);
  const sameMonth = startIsoDate.slice(0, 7) === end.slice(0, 7);
  const start = sameMonth
    ? new Date(`${startIsoDate}T00:00:00Z`).getUTCDate().toString()
    : formatDayMonth(startIsoDate);
  return `du ${start} au ${formatDayMonth(end)}`;
}

const shortDayMonthFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
});

/** « 29 sept. », pour les surtitres serrés. */
export function formatShortDayMonth(isoDate: string): string {
  return shortDayMonthFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * « aujourd'hui », « hier », le nom du jour dans la semaine écoulée, sinon la
 * date courte. C'est ainsi qu'on parle d'une pesée ou d'une séance récente :
 * « jeudi » se lit plus vite que « 25 septembre ».
 */
export function formatRecentDay(isoDate: string, today: string = todayInParis()): string {
  if (isoDate === today) {
    return 'aujourd’hui';
  }
  if (isoDate === shiftDate(today, -1)) {
    return 'hier';
  }
  if (isoDate > shiftDate(today, -7) && isoDate < today) {
    return formatWeekday(isoDate);
  }
  return formatShortDayMonth(isoDate);
}

/** « 29 sept. – 5 oct. », la semaine en surtitre court. */
export function formatShortWeekRange(startIsoDate: string): string {
  return `${formatShortDayMonth(startIsoDate)} – ${formatShortDayMonth(shiftDate(startIsoDate, 6))}`;
}

/** Numéro de semaine ISO 8601 : celle qui contient le premier jeudi de l'année est la 1. */
export function isoWeekNumber(isoDate: string): number {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

const weekdayInitials = ['D', 'L', 'M', 'M', 'J', 'V', 'S'] as const;
const weekdayShort = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] as const;

/** « L 29 » : l'initiale du jour et son quantième, pour la bande de la semaine. */
export function formatDayInitial(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return `${weekdayInitials[date.getUTCDay()]} ${date.getUTCDate()}`;
}

/** « Lun 29 » : le jour abrégé et son quantième, pour les lignes du plan. */
export function formatDayShort(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return `${weekdayShort[date.getUTCDay()]} ${date.getUTCDate()}`;
}
