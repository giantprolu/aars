/**
 * Jeu de cas de modération, étiquetés à la main.
 *
 * `expect` dit ce que la politique doit faire du texte, écrit avant d'être
 * montré (`preExposure`) :
 * - `allow` : rien, aucun dossier ;
 * - `review` : un dossier en file humaine, le texte reste visible ;
 * - `block` : le texte est refusé (pseudo) ou masqué (nom de séance, exercice).
 *
 * `known_miss` marque un cas que les règles locales ne savent pas traiter,
 * gardé pour mesurer la limite plutôt que pour la cacher. Il ne fait pas
 * échouer la vérification, mais il est compté et affiché.
 *
 * Les vagues de signalements (COORDINATED_ABUSE) sont à part, dans
 * `COORDINATED_CASES` : elles ne portent pas sur un texte.
 */

export type DatasetClass =
  | 'SAFE'
  | 'AMBIGUOUS'
  | 'HARASSMENT'
  | 'HATE'
  | 'THREAT'
  | 'SPAM'
  | 'SCAM'
  | 'SEXUAL'
  | 'MINOR_SAFETY'
  | 'SELF_HARM'
  | 'ILLEGAL';

export interface DatasetCase {
  class: DatasetClass;
  text: string;
  field: 'identity' | 'template_name' | 'exercise_name';
  expect: 'allow' | 'review' | 'block';
  known_miss?: true;
}

const c = (
  klass: DatasetClass,
  field: DatasetCase['field'],
  expect: DatasetCase['expect'],
  text: string,
  known_miss?: true,
): DatasetCase => ({ class: klass, text, field, expect, ...(known_miss ? { known_miss } : {}) });

export const DATASET: readonly DatasetCase[] = [
  // Ce qui doit passer sans un mot : les noms ordinaires, le jargon de salle.
  c('SAFE', 'identity', 'allow', 'camille92'),
  c('SAFE', 'identity', 'allow', 'Camille Lefort'),
  c('SAFE', 'identity', 'allow', 'jean_pierre'),
  c('SAFE', 'identity', 'allow', 'Montenegro'),
  c('SAFE', 'identity', 'allow', 'Сamille'),
  c('SAFE', 'identity', 'allow', 'stop pédophilie'),
  c('SAFE', 'identity', 'allow', 'Pascal Cassoulet'),
  c('SAFE', 'identity', 'allow', 'Dr Muscle'),
  c('SAFE', 'identity', 'allow', 'la bête de la salle'),
  c('SAFE', 'identity', 'allow', 'Coach Sophie'),
  c('SAFE', 'template_name', 'allow', 'Leg day : j’ai tué les jambes'),
  c('SAFE', 'template_name', 'allow', 'Séance de folle'),
  c('SAFE', 'template_name', 'allow', 'Vélo pédale douce'),
  c('SAFE', 'template_name', 'allow', 'Jeûne 16/8 et cardio'),
  c('SAFE', 'template_name', 'allow', 'Pecs dos massacre'),
  c('SAFE', 'template_name', 'allow', 'Je suis crevé mais fier'),
  c('SAFE', 'template_name', 'allow', 'Push Pull Legs'),
  c('SAFE', 'template_name', 'allow', 'Haut du corps A'),
  c('SAFE', 'template_name', 'allow', 'Séance qui tue'),
  c('SAFE', 'template_name', 'allow', 'Défoncer le record au squat'),
  c('SAFE', 'template_name', 'allow', 'Cul-de-sac cardio'),
  c('SAFE', 'template_name', 'allow', 'Gainage 3x45 s'),
  c('SAFE', 'exercise_name', 'allow', 'Développé couché'),
  c('SAFE', 'exercise_name', 'allow', 'Soulevé de terre roumain'),
  c('SAFE', 'exercise_name', 'allow', 'Hip thrust'),
  c('SAFE', 'exercise_name', 'allow', 'Rowing barre T'),
  c('SAFE', 'exercise_name', 'allow', 'Presse à cuisses 45°'),
  c('SAFE', 'exercise_name', 'allow', 'Butt kicks'),
  c('SAFE', 'exercise_name', 'allow', 'Pompes diamant'),
  c('SAFE', 'exercise_name', 'allow', 'Rééducation épaule'),
  // Mots ordinaires ici, grossiers dans une autre langue des listes ouvertes.
  c('SAFE', 'template_name', 'allow', 'J’ai mal aux jambes'),
  c('SAFE', 'template_name', 'allow', 'Push and pull'),
  c('SAFE', 'template_name', 'allow', 'Hard training'),
  c('SAFE', 'template_name', 'allow', 'Domination au squat'),
  c('SAFE', 'template_name', 'allow', 'Inferno HIIT'),
  c('SAFE', 'identity', 'allow', 'fan_de_muscu'),
  c('SAFE', 'identity', 'allow', 'aars_fan'),
  c('SAFE', 'identity', 'allow', 'Bob Martin'),
  c('SAFE', 'identity', 'allow', 'Anita'),
  c('SAFE', 'identity', 'allow', 'proud homosexual'),
  c('SAFE', 'exercise_name', 'allow', 'Pot de protéines'),
  c('SAFE', 'exercise_name', 'allow', 'Tête et cou'),

  // Ambigus : un dossier peut s'ouvrir, rien ne doit être masqué.
  c('AMBIGUOUS', 'template_name', 'allow', 'Je vais te tuer de rire 😂'),
  c('AMBIGUOUS', 'template_name', 'allow', 'Je vais te défoncer au squat'),
  c('AMBIGUOUS', 'template_name', 'allow', 'Mort de rire à la muscu'),
  c('AMBIGUOUS', 'identity', 'review', 'pd_du_93'),
  c('AMBIGUOUS', 'identity', 'review', 'tapette_a_mouche'),
  c('AMBIGUOUS', 'identity', 'review', 'objectif38kg'),
  c('AMBIGUOUS', 'template_name', 'review', 'jeûne de 5 jours'),
  c('AMBIGUOUS', 'template_name', 'review', 'Hijo de puta'),
  c('AMBIGUOUS', 'identity', 'review', 'scheisse'),

  // Harcèlement et insultes, y compris déguisés.
  c('HARASSMENT', 'identity', 'block', 'connard'),
  c('HARASSMENT', 'identity', 'block', 'c0nn4rd'),
  c('HARASSMENT', 'identity', 'block', 'c o n n a r d'),
  c('HARASSMENT', 'identity', 'block', 'c*nnard'),
  c('HARASSMENT', 'identity', 'block', 'xconnardx'),
  c('HARASSMENT', 'identity', 'block', 'conn​ard'),
  c('HARASSMENT', 'identity', 'block', 'connnnnnard'),
  c('HARASSMENT', 'identity', 'block', 'fils de pute'),
  c('HARASSMENT', 'template_name', 'block', 'Grosse truie au cardio'),
  c('HARASSMENT', 'template_name', 'block', 'Suicide toi'),
  c('HARASSMENT', 'template_name', 'block', 'kys'),
  c('HARASSMENT', 'identity', 'block', 'motherfucker'),
  c('HARASSMENT', 'template_name', 'block', 'Nique ta mère'),
  c('HARASSMENT', 'identity', 'block', 'salope'),
  c('HARASSMENT', 'template_name', 'block', 'Va te pendre'),
  // Grossier sans viser grand-monde : risque faible, journalisé, pas de dossier.
  c('HARASSMENT', 'template_name', 'allow', 'Ta gueule'),
  c('HARASSMENT', 'template_name', 'block', 't’es nul et tout le monde le sait', true),

  // Haine et discrimination.
  c('HATE', 'identity', 'block', 'sale arabe'),
  c('HATE', 'identity', 'block', 'bougnoule'),
  c('HATE', 'identity', 'block', 'b0ugn0ule'),
  c('HATE', 'identity', 'block', 'youpin'),
  c('HATE', 'identity', 'block', 'sale pd'),
  c('HATE', 'template_name', 'block', 'Mort aux juifs'),
  c('HATE', 'identity', 'block', 'heil hitler'),
  c('HATE', 'identity', 'block', 'nigger'),
  c('HATE', 'identity', 'block', 'faggot'),
  c('HATE', 'identity', 'block', 'travelo'),
  c('HATE', 'identity', 'block', 'white power'),
  c('HATE', 'identity', 'block', '1488'),
  c('HATE', 'identity', 'block', 'Les musulmans dehors', true),

  // Menaces : directes, crédibles, et la glorification.
  c('THREAT', 'template_name', 'block', 'Je vais te retrouver demain et te tuer'),
  c('THREAT', 'template_name', 'block', 'Je vais te tuer'),
  c('THREAT', 'template_name', 'block', 'Je sais où tu habites'),
  // Seul, « t'es mort » se dit aussi d'une partie perdue : revue, pas masquage.
  c('THREAT', 'template_name', 'review', 'T’es mort'),
  c('THREAT', 'template_name', 'block', 'I will kill you'),
  c('THREAT', 'template_name', 'block', 'I know where you live'),
  c('THREAT', 'template_name', 'block', 'On va te faire la peau'),
  c('THREAT', 'template_name', 'block', 'Vive daech'),
  c('THREAT', 'template_name', 'review', 'Je vais te frapper'),
  c('THREAT', 'template_name', 'block', 'Ce soir je te plante devant chez toi'),

  // Spam : liens, numéros, répétitions.
  c('SPAM', 'identity', 'block', 'bit.ly/promo'),
  c('SPAM', 'identity', 'block', 'monsite.xyz'),
  c('SPAM', 'identity', 'block', 'www.example.com'),
  c('SPAM', 'identity', 'block', '06 12 34 56 78'),
  c('SPAM', 'identity', 'block', 'ecris moi jean@gmail.com'),
  c('SPAM', 'identity', 'block', 't.me/mongroupe'),
  c('SPAM', 'identity', 'block', 'discord.gg/abc'),
  c('SPAM', 'template_name', 'allow', 'aaaaaaaaaaaa'),

  // Arnaques, hameçonnage, usurpation.
  c('SCAM', 'identity', 'block', 'paypal-secure.xyz'),
  c('SCAM', 'identity', 'block', 'support_aars'),
  c('SCAM', 'identity', 'block', 'Modérateur'),
  c('SCAM', 'identity', 'block', 'Équipe Aars'),
  c('SCAM', 'template_name', 'block', 'Argent facile en 7 jours'),
  c('SCAM', 'template_name', 'block', 'Double ton argent'),
  c('SCAM', 'template_name', 'block', 'Recharge PCS'),
  c('SCAM', 'identity', 'block', 'http://192.168.1.10/login'),
  c('SCAM', 'identity', 'block', 'xn--pypal-4ve.com'),
  c('SCAM', 'template_name', 'block', 'Giveaway bitcoin'),

  // Contenu sexuel.
  c('SEXUAL', 'identity', 'block', 'porno'),
  c('SEXUAL', 'template_name', 'block', 'Envoie des nudes'),
  c('SEXUAL', 'identity', 'block', 'baise moi'),
  c('SEXUAL', 'template_name', 'block', 'Dick pic'),
  c('SEXUAL', 'identity', 'review', 'plan cul'),
  c('SEXUAL', 'identity', 'block', 'onlyfans'),

  // Mineurs : toujours au moins une revue P0.
  c('MINOR_SAFETY', 'identity', 'block', 'pthc'),
  c('MINOR_SAFETY', 'identity', 'block', 'jailbait'),
  c('MINOR_SAFETY', 'template_name', 'block', 'Photos nue 14 ans'),
  c('MINOR_SAFETY', 'identity', 'block', 'pedophile'),
  c('MINOR_SAFETY', 'identity', 'block', 'lolicon'),

  // Auto-agression et troubles alimentaires : masqués, jamais sanctionnés.
  c('SELF_HARM', 'identity', 'block', 'pro ana'),
  c('SELF_HARM', 'identity', 'block', 'thinspo'),
  c('SELF_HARM', 'template_name', 'block', 'Je veux mourir'),
  c('SELF_HARM', 'template_name', 'block', 'Me faire vomir après manger'),
  c('SELF_HARM', 'template_name', 'review', 'Arrêter de manger'),
  c('SELF_HARM', 'template_name', 'block', 'Je vais me suicider'),

  // Ventes interdites.
  c('ILLEGAL', 'exercise_name', 'block', 'Vends dianabol'),
  c('ILLEGAL', 'identity', 'block', 'vente trenbolone dispo'),
  c('ILLEGAL', 'template_name', 'block', 'Coke a vendre'),
  c('ILLEGAL', 'identity', 'block', 'flingue a vendre'),
];

/** Une vague de signalements simulée, et ce qu'on attend de la détection. */
export interface CoordinatedCase {
  name: string;
  reports: { reporterId: number; reporterAgeDays: number; weight: number; note: string | null; minutesAgo: number }[];
  coordinated: boolean;
}

const wave = (count: number, ageDays: number, weight: number, note: string | null, spreadMinutes: number) =>
  Array.from({ length: count }, (_, index) => ({
    reporterId: 100 + index,
    reporterAgeDays: ageDays,
    weight,
    note,
    minutesAgo: Math.round((spreadMinutes * index) / Math.max(1, count - 1)),
  }));

export const COORDINATED_CASES: readonly CoordinatedCase[] = [
  { name: '100 comptes d’un jour, même cible, en une heure', reports: wave(100, 1, 0.15, null, 60), coordinated: true },
  { name: '5 comptes récents, même note', reports: wave(5, 2, 0.15, 'Il triche, signalez le !', 30), coordinated: true },
  { name: '4 comptes anciens, même longue note copiée', reports: wave(4, 200, 0.8, 'compte a bannir svp, il triche tout le temps', 20), coordinated: true },
  { name: '3 comptes anciens, même note courte', reports: wave(3, 200, 0.8, 'pseudo raciste', 20), coordinated: false },
  { name: '3 comptes anciens et fiables, notes différentes', reports: [
    { reporterId: 1, reporterAgeDays: 300, weight: 0.8, note: 'insulte en pseudo', minutesAgo: 10 },
    { reporterId: 2, reporterAgeDays: 120, weight: 0.75, note: null, minutesAgo: 50 },
    { reporterId: 3, reporterAgeDays: 90, weight: 0.7, note: 'pseudo raciste', minutesAgo: 200 },
  ], coordinated: false },
  { name: '2 signalements seulement', reports: wave(2, 1, 0.15, null, 5), coordinated: false },
  { name: '10 comptes récents, étalés sur deux semaines', reports: wave(10, 3, 0.15, null, 14 * 24 * 60), coordinated: false },
];
