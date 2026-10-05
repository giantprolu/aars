/**
 * Les règles locales : ce que le lexique, les motifs de phrase et le contexte
 * permettent de voir dans un texte court, sans rien envoyer à personne.
 *
 * Le contexte compte autant que le mot. « Je vais te tuer de rire 😂 » n'est
 * pas une menace ; « je vais te retrouver demain et te tuer » en est une, plus
 * grave qu'une simple insulte. Et dans une app de sport, « j'ai tué les
 * jambes » ou « je vais te défoncer au squat » ne visent personne.
 */

import { CONTROLLED_PRODUCTS, IMPERSONATION, LEXICON, SALE_WORDS, type LexiconEntry } from './lexicon';
import { detectLinks } from './links';
import { foldTerm, maskedMatches, normalizeText, type NormalizedText } from './normalize';
import { SEVERITIES, severityRank, unit, type Detection, type ModerationCategory, type Severity } from './types';
import { openWordList } from './wordlists';

/**
 * Le champ d'où vient le texte. Il change la lecture : se faire appeler
 * « Support » est une usurpation dans un pseudo, pas dans un nom de séance.
 */
export type TextField = 'identity' | 'template_name' | 'exercise_name' | 'report_note';

interface CompiledEntry extends LexiconEntry {
  folded: string;
  phrase: boolean;
}

let compiledLexicon: CompiledEntry[] | null = null;

function lexicon(): CompiledEntry[] {
  compiledLexicon ??= LEXICON.map((entry) => {
    const folded = foldTerm(entry.term);
    return { ...entry, folded, phrase: folded.includes(' ') };
  });
  return compiledLexicon;
}

/** Vrai si le mot est le terme, ou sa forme au pluriel ou au féminin. */
function wordMatches(token: string, term: string): boolean {
  return token === term || token === `${term}s` || token === `${term}e` || token === `${term}es` || token === `${term}x`;
}

/** Cherche un terme dans une forme repliée : phrase entière, mot, ou à l'intérieur d'un mot si `embed`. */
function contains(form: string, entry: { folded: string; phrase: boolean; embed?: boolean }): boolean {
  if (form === '') {
    return false;
  }
  if (entry.phrase) {
    return ` ${form} `.includes(` ${entry.folded} `) || ` ${form} `.includes(` ${entry.folded}s `);
  }
  const tokens = form.split(' ');
  if (tokens.some((token) => wordMatches(token, entry.folded))) {
    return true;
  }
  // Un pseudo colle ses mots (« xconnardx ») : seuls les termes sans
  // ambiguïté y sont cherchés, et sans les espaces.
  return entry.embed === true && form.replace(/ /g, '').includes(entry.folded);
}

const HUMOR = /(\u{1F602}|\u{1F923}|\u{1F606}|\u{1F639}|\u{1F605}|\bmdr\b|\bptdr\b|\bxptdr\b|\blol\b|\bjpp\b|\bhaha+\b|\bde rire\b|\bje rigole\b|\bje plaisante\b)/u;

const IDIOMS = /\b(mort de rire|morte de rire|tuer de rire|tue de rire|me tuer a la tache|me tuer au travail|tuer le temps|tue l amour|crever de faim|creve de chaud)\b/;

const SPORT_TARGETS =
  '(jambes?|bras|pecs|pectoraux|abdos|cuisses|dos|epaules|fessiers|mollets|muscles?|quadri|quadriceps|ischios?|biceps|triceps|seance|entrainement|entrainements|record|records|pr|squat|squats|dc|developpe|bench|deadlift|souleve|wod|cardio|leg day|legs|chest|salle|muscu|tractions|pompes)';

/** Le jargon de salle : on « tue » ses jambes, on « défonce » un record. */
const SPORT_JARGON = new RegExp(
  String.raw`\b(tuer|tue|tuee|massacrer|massacre|detruire|detruit|defoncer|defonce|eclater|eclate|exploser|explose|achever|acheve|bousiller|kill|killed|destroy|smash|crush)\b.{0,24}\b${SPORT_TARGETS}\b|\b${SPORT_TARGETS}\b.{0,24}\b(tue|tues|tuee|detruit|detruits|explose|eclate|killer|massacre)\b|\b(au|a la|en) (squat|dc|developpe|bench|deadlift|souleve|muscu|salle|course|tractions)\b`,
);

const VIOLENT_STRONG = '(tuer|buter|egorger|planter|poignarder|crever|achever|decapiter|bruler|massacrer)';
const VIOLENT_AMBIGUOUS = '(defoncer|eclater|niquer|frapper|tabasser|casser la gueule|retrouver|choper|faire payer)';

/** Menaces : verbe violent adressé à quelqu'un. */
const THREATS: readonly { pattern: RegExp; severity: Severity; confidence: number; signal: string }[] = [
  {
    pattern: new RegExp(String.raw`\b(je|j|on|nous) (vais|vai|va|vas|allons|veux) (te|t|vous) ${VIOLENT_STRONG}\b`),
    severity: 'high',
    confidence: 0.85,
    signal: 'direct_threat',
  },
  {
    pattern: new RegExp(String.raw`\b(je|j|on|nous) (vais|vai|va|vas|allons|veux) (te|t|vous) ${VIOLENT_AMBIGUOUS}\b`),
    severity: 'medium',
    confidence: 0.6,
    signal: 'ambiguous_threat',
  },
  { pattern: /\b(je|on) (te|t) (tue|bute|egorge|plante|creve|acheve)\b/, severity: 'high', confidence: 0.8, signal: 'direct_threat' },
  {
    pattern: new RegExp(String.raw`\b(et|puis|pour|de) (te|t) ${VIOLENT_STRONG}\b`),
    severity: 'high',
    confidence: 0.65,
    signal: 'violent_verb_addressed',
  },
  { pattern: /\b(t es|tu es|t est|vous etes) (un homme )?(mort|morte|morts)\b/, severity: 'high', confidence: 0.75, signal: 'death_threat' },
  { pattern: /\btu vas (mourir|crever|morfler|y passer)\b/, severity: 'high', confidence: 0.75, signal: 'death_threat' },
  { pattern: /\btu vas souffrir\b/, severity: 'medium', confidence: 0.5, signal: 'ambiguous_threat' },
  {
    pattern: /\b(je|on) (sait|sais|connait|connais) (ou tu (habites|vis|dors|bosses|travailles|t entraines|es)|ton adresse)\b/,
    severity: 'severe',
    confidence: 0.9,
    signal: 'location_threat',
  },
  { pattern: /\b(i will|i ll|im going to|i m going to|gonna|we will|we re going to) (kill|murder|stab|shoot|hurt) (you|u)\b/, severity: 'high', confidence: 0.85, signal: 'direct_threat' },
  { pattern: /\b(i will|i ll|im going to|i m going to|gonna) find (you|u)\b/, severity: 'medium', confidence: 0.6, signal: 'ambiguous_threat' },
  { pattern: /\b(you re|youre|you are|ur) dead\b/, severity: 'high', confidence: 0.7, signal: 'death_threat' },
  { pattern: /\bi know where (you|u) live\b/, severity: 'severe', confidence: 0.9, signal: 'location_threat' },
];

/** Ce qui rend une menace crédible : un moment, un lieu, un moyen. */
const CREDIBLE_DETAIL =
  /\b(demain|ce soir|tout a l heure|a la sortie|devant chez toi|chez toi|ton adresse|ta maison|couteau|flingue|arme|pistolet|batte|tomorrow|tonight|knife|gun)\b/;

const MINOR_AGE = /\b([5-9]|1[0-5]) ?(ans|an|yo|y o|years? old)\b/;
const SEXUAL_HINT =
  /\b(nue?s?|nude|nudes|sexe|sex|sexy|bite|suce|sucer|baise|baiser|chaude?|coquine?|photos? hot|plan cul|porno?|seins|nichons)\b/;

/** Jeûne prolongé : un jeûne de 16 h est une méthode, un jeûne de cinq jours un risque. */
const PROLONGED_FAST = /\b(jeune|jeuner|jeuné|fast|fasting|water fast) (de |of )?([3-9]|[1-9]\d) ?(jours|j|days)\b/;
const GOAL_WEIGHT = /\b(objectif|obj|goal|gw|ugw|cible) ?:? ?(\d{2})(?:[.,]\d)? ?(kg|kilos?)?\b/;
/** Sous ce poids visé, quelle que soit la taille, on s'inquiète plutôt qu'on ne juge. */
const LOW_GOAL_KG = 45;

const SELF_HARM_FIRST_PERSON = /\b(je|j) (vais|veux|voudrais) (me tuer|me suicider|mourir|disparaitre|me faire du mal)\b/;

/** Répétitions qui ne disent rien : « aaaaaaaa », « top top top top ». */
const REPEATED_CHARACTER = /(.)\1{6,}/u;

function bump(severity: Severity): Severity {
  return SEVERITIES[Math.min(SEVERITIES.length - 1, severityRank(severity) + 1)] ?? severity;
}

/**
 * Rassemble les détections par catégorie. Des indices distincts d'une même
 * catégorie se renforcent (« ou » probabiliste : 1 − Π(1 − c)), plafonné à
 * 0,95 : deux termes d'arnaque côte à côte disent plus qu'un seul, sans
 * jamais valoir une certitude.
 */
export function mergeDetections(detections: readonly Detection[]): Detection[] {
  const byCategory = new Map<ModerationCategory, Detection[]>();
  for (const detection of detections) {
    byCategory.set(detection.category, [...(byCategory.get(detection.category) ?? []), detection]);
  }
  const merged: Detection[] = [];
  for (const group of byCategory.values()) {
    const sorted = [...group].sort(
      (a, b) => b.confidence * (severityRank(b.severity) + 1) - a.confidence * (severityRank(a.severity) + 1),
    );
    const best = sorted[0];
    if (best === undefined) {
      continue;
    }
    const highest = sorted.reduce<Severity>(
      (worst, entry) => (severityRank(entry.severity) > severityRank(worst) ? entry.severity : worst),
      best.severity,
    );
    merged.push({
      source: best.source,
      category: best.category,
      severity: highest,
      confidence: unit(Math.min(0.95, 1 - sorted.reduce((miss, entry) => miss * (1 - entry.confidence), 1))),
      signals: [...new Set(sorted.flatMap((entry) => entry.signals))],
    });
  }
  return merged;
}

export interface RulesResult {
  normalized: NormalizedText;
  detections: Detection[];
  /** Signaux de contexte relevés, détection ou non (`humor`, `sport_jargon`…). */
  context: string[];
}

/**
 * Applique les règles locales à un texte.
 *
 * Les détections rendues sont déjà ajustées au contexte et fusionnées par
 * catégorie. Le texte lui-même ne sort jamais d'ici : seuls des noms de
 * signaux en sortent, pour l'audit.
 */
export function detectWithRules(raw: string, field: TextField): RulesResult {
  const normalized = normalizeText(raw);
  const { plain, literal, folded, masked } = normalized;
  /** Un motif de phrase se lit sur les mots tels qu'écrits, ou réduits si on a étiré les lettres. */
  const says = (pattern: RegExp): boolean => pattern.test(normalized.words) || pattern.test(folded);
  const found: Detection[] = [];
  const context: string[] = [];

  const humor = HUMOR.test(plain);
  const idiom = says(IDIOMS);
  const sport = says(SPORT_JARGON);
  if (humor) {
    context.push('humor');
  }
  if (idiom) {
    context.push('idiom');
  }
  if (sport) {
    context.push('sport_jargon');
  }

  for (const entry of lexicon()) {
    const inFolded = contains(folded, entry);
    const inMasked = !inFolded && !entry.phrase && masked.some((word) => maskedMatches(word, entry.folded));
    if (!inFolded && !inMasked) {
      continue;
    }
    const disguised = inMasked || !contains(literal, entry);
    found.push({
      source: 'rules',
      category: entry.category,
      severity: entry.severity,
      confidence: unit(entry.confidence + (disguised ? 0.05 : 0)),
      signals: [`lexicon_${entry.category}`, ...(disguised ? ['evasion', ...normalized.signals] : [])],
    });
  }

  for (const threat of THREATS) {
    if (says(threat.pattern)) {
      const credible = says(CREDIBLE_DETAIL);
      found.push({
        source: 'rules',
        category: 'threat',
        severity: credible ? bump(threat.severity) : threat.severity,
        confidence: unit(threat.confidence + (credible ? 0.1 : 0)),
        signals: [threat.signal, ...(credible ? ['credible_detail'] : [])],
      });
    }
  }

  if (MINOR_AGE.test(plain) && says(SEXUAL_HINT)) {
    found.push({ source: 'rules', category: 'minor_safety', severity: 'critical', confidence: 0.9, signals: ['minor_age_sexual'] });
  }

  if (says(SALE_WORDS)) {
    for (const product of CONTROLLED_PRODUCTS) {
      if (says(product.pattern)) {
        found.push({ source: 'rules', category: 'illegal', severity: 'high', confidence: 0.75, signals: [product.signal] });
      }
    }
  }

  if (says(SELF_HARM_FIRST_PERSON)) {
    found.push({ source: 'rules', category: 'self_harm', severity: 'high', confidence: 0.8, signals: ['first_person_self_harm'] });
  }
  if (PROLONGED_FAST.test(plain)) {
    found.push({ source: 'rules', category: 'self_harm', severity: 'medium', confidence: 0.5, signals: ['prolonged_fast'] });
  }
  const goal = GOAL_WEIGHT.exec(plain.replace(/(\d)(kg)/g, '$1 $2'));
  if (goal !== null && Number(goal[2]) < LOW_GOAL_KG) {
    found.push({ source: 'rules', category: 'self_harm', severity: 'medium', confidence: 0.55, signals: ['low_goal_weight'] });
  }

  if (field === 'identity' && says(IMPERSONATION)) {
    found.push({ source: 'rules', category: 'scam', severity: 'high', confidence: 0.75, signals: ['impersonation'] });
  }

  if (REPEATED_CHARACTER.test(plain)) {
    found.push({ source: 'rules', category: 'spam', severity: 'low', confidence: 0.5, signals: ['repeated_characters'] });
  }

  // Les listes ouvertes ne comptent que là où le lexique classé n'a rien vu :
  // elles ne savent pas dire la gravité, elles ne font qu'ouvrir une revue.
  if (!found.some((detection) => detection.category === 'harassment' || detection.category === 'hate' || detection.category === 'sexual')) {
    const plainWords = plain.replace(/[\p{P}\p{S}\s]+/gu, ' ').trim();
    for (const entry of openWordList()) {
      const hit =
        entry.form === 'substring'
          ? plain.includes(entry.term)
          : entry.form === 'plain'
            ? ` ${plainWords} `.includes(` ${entry.term} `)
            : contains(folded, { folded: entry.term, phrase: entry.term.includes(' ') });
      if (hit) {
        found.push({
          source: 'rules',
          category: 'harassment',
          severity: 'high',
          confidence: 0.55,
          signals: ['open_word_list', `open_word_list_${entry.language}`],
        });
        break;
      }
    }
  }

  // Le contexte atténue, il n'efface pas : une menace « pour rire » reste
  // en file si elle est assez nette, et rien n'atténue ce qui touche aux mineurs.
  const adjusted = found.map((detection): Detection => {
    let factor = 1;
    const signals: string[] = [];
    if (detection.category === 'threat' && sport) {
      factor *= 0.2;
      signals.push('sport_jargon');
    }
    if ((detection.category === 'threat' || detection.category === 'self_harm') && idiom) {
      factor *= 0.2;
      signals.push('idiom');
    }
    if (humor && (detection.category === 'threat' || detection.category === 'self_harm')) {
      factor *= detection.category === 'threat' ? 0.4 : 0.5;
      signals.push('humor');
    }
    if (humor && detection.category === 'harassment' && detection.signals.includes('open_word_list')) {
      factor *= 0.7;
      signals.push('humor');
    }
    if (factor === 1) {
      return detection;
    }
    return { ...detection, confidence: unit(detection.confidence * factor), signals: [...detection.signals, ...signals] };
  });

  return { normalized, detections: mergeDetections(adjusted), context };
}

/**
 * Tout ce que l'app sait voir seule dans un texte : les règles, puis les
 * liens. C'est ce que le serveur applique, à travers ses fournisseurs.
 */
export function classifyLocally(raw: string, field: TextField): RulesResult {
  const result = detectWithRules(raw, field);
  return { ...result, detections: mergeDetections([...result.detections, ...detectLinks(result.normalized.plain)]) };
}
