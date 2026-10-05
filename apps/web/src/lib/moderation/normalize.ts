/**
 * Ramener un texte à sa forme lisible, pour que les règles voient ce qu'un
 * humain lit, et non ce qu'on a tapé pour passer entre les mailles.
 *
 * Plusieurs formes sont produites, parce qu'aucune ne sert à tout :
 *
 * - `plain` : minuscules, sans accents ni caractères invisibles, homoglyphes
 *   ramenés à leur lettre latine. Les chiffres y restent : une adresse, un
 *   numéro, « 38 kg » s'y lisent tels quels.
 * - `words` : `plain` dont le leet est traduit (« c0nn4rd »), la ponctuation
 *   remplacée par des espaces et les lettres espacées recollées (« c o n »).
 *   Les motifs de phrase (menaces, ventes…) la lisent.
 * - `folded` : `words` aux lettres répétées réduites (« connnnard »). C'est
 *   elle que lit le lexique, lui-même replié de la même façon.
 * - `masked` : les mots dont une lettre est cachée (« c*nnard »), à comparer
 *   au lexique lettre à lettre.
 *
 * Chaque transformation qui a changé quelque chose laisse un signal : le
 * déguisement est en lui-même une information, qui aggrave le score.
 */

export type EvasionSignal =
  | 'zero_width'
  | 'homoglyph'
  | 'leet'
  | 'spaced_letters'
  | 'repeated_letters'
  | 'masked_letters';

export interface NormalizedText {
  plain: string;
  /**
   * `plain` sans ponctuation et aux lettres répétées réduites, mais sans rien
   * traduire ni recoller : un terme trouvé ici n'était pas déguisé.
   */
  literal: string;
  /**
   * Comme `folded`, mais sans réduire les lettres répétées : c'est la forme
   * que lisent les motifs de phrase, écrits avec leur orthographe.
   */
  words: string;
  folded: string;
  /** Mots de `folded`. */
  tokens: string[];
  /** Mots de `plain` contenant `*` ou `#` entre des lettres, repliés. */
  masked: string[];
  signals: EvasionSignal[];
}

/** Caractères invisibles ou de contrôle de sens d'écriture, glissés pour couper un mot. */
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁤⁦-⁯ㅤ﻿ﾠ]/g;

/**
 * Lettres d'autres alphabets qui se lisent comme des lettres latines. La
 * liste couvre ce qu'on trouve en pratique (cyrillique et grec) ; NFKC a déjà
 * ramené les variantes mathématiques et pleine chasse.
 */
const HOMOGLYPHS: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x',
  і: 'i', ї: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ԛ: 'q', ԝ: 'w', һ: 'h', ӏ: 'l',
  α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', γ: 'y',
  ı: 'i', ł: 'l', ø: 'o', đ: 'd', ß: 'ss', æ: 'ae', œ: 'oe',
};

/** Chiffres et symboles employés pour des lettres. */
const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g',
  '@': 'a', $: 's', '€': 'e', '!': 'i', '|': 'l', '£': 'l',
};

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{M}+/gu, '');
}

/** `plain` : la forme commune, sans rien traduire du sens. */
function toPlain(raw: string, signals: Set<EvasionSignal>): string {
  let text = raw.normalize('NFKC');
  const visible = text.replace(INVISIBLE, '');
  if (visible !== text) {
    signals.add('zero_width');
  }
  text = stripAccents(visible.toLowerCase());
  let mapped = '';
  for (const character of text) {
    const latin = HOMOGLYPHS[character];
    if (latin !== undefined) {
      mapped += latin;
      // Une lettre étrangère au milieu de lettres latines est un déguisement ;
      // un mot entièrement en grec ou en cyrillique n'en est pas un.
      if (/[a-z]/.test(text)) {
        signals.add('homoglyph');
      }
    } else {
      mapped += character;
    }
  }
  return mapped.replace(/\s+/g, ' ').trim();
}

/** Recolle les lettres isolées qui se suivent : « c o n n a r d » → « connard ». */
function joinSpacedLetters(text: string): { text: string; joined: boolean } {
  let joined = false;
  const result = text.replace(/\b(?:[a-z][ ._\-*~+]{1,3}){3,}[a-z]\b/g, (run) => {
    joined = true;
    return run.replace(/[^a-z]/g, '');
  });
  return { text: result, joined };
}

/** Réduit chaque suite d'une même lettre à une seule. Le lexique est réduit de la même façon. */
export function squeeze(word: string): string {
  return word.replace(/([a-z])\1+/g, '$1');
}

/** Le repli d'un terme du lexique : la même chaîne que celle que subit le texte. */
export function foldTerm(term: string): string {
  const signals = new Set<EvasionSignal>();
  return squeezeWords(toWords(toPlain(term, signals), signals), signals);
}

/** La forme `plain` d'un terme, pour les écritures que `folded` efface (arabe, chinois…). */
export function plainTerm(term: string): string {
  return toPlain(term, new Set());
}

/** Leet traduit, lettres espacées recollées, ponctuation en espaces : des mots, sans plus. */
function toWords(plain: string, signals: Set<EvasionSignal>): string {
  let leet = '';
  const words = plain.split(' ');
  for (const word of words) {
    // Le leet ne se traduit que dans un mot qui contient déjà des lettres :
    // « 38 kg » reste un nombre, « c0nn4rd » devient un mot.
    const translated = /[a-z]/.test(word)
      ? word.replace(/[0-9@$€!|£]/g, (character) => LEET[character] ?? character)
      : word;
    if (translated !== word) {
      signals.add('leet');
    }
    leet += `${translated} `;
  }
  const spaced = joinSpacedLetters(leet.trim());
  if (spaced.joined) {
    signals.add('spaced_letters');
  }
  return spaced.text.replace(/[^a-z0-9]+/g, ' ').trim();
}

/** `folded` : les mots de `toWords`, lettres répétées réduites. */
function squeezeWords(words: string, signals: Set<EvasionSignal>): string {
  return words
    .split(' ')
    .map((word) => {
      const reduced = squeeze(word);
      if (/([a-z])\1\1/.test(word)) {
        signals.add('repeated_letters');
      }
      return reduced;
    })
    .join(' ');
}

/** Les mots dont des lettres ont été remplacées par `*` ou `#`. */
function maskedWords(plain: string): string[] {
  const found: string[] = [];
  for (const word of plain.split(/[\s.,;:!?'"()]+/)) {
    if (/[a-z][*#]+[a-z]|^[a-z][*#]|[*#][a-z]$/.test(word) && /[a-z]/.test(word)) {
      found.push(squeeze(word.replace(/[^a-z*#]/g, '').replace(/#/g, '*')));
    }
  }
  return found;
}

export function normalizeText(raw: string): NormalizedText {
  const signals = new Set<EvasionSignal>();
  const plain = toPlain(raw, signals);
  const words = toWords(plain, signals);
  const folded = squeezeWords(words, signals);
  const masked = maskedWords(plain);
  if (masked.length > 0) {
    signals.add('masked_letters');
  }
  const literal = plain
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map(squeeze)
    .join(' ');
  return {
    plain,
    literal,
    words,
    folded,
    tokens: folded === '' ? [] : folded.split(' '),
    masked,
    signals: [...signals],
  };
}

/**
 * Vrai si un mot masqué peut être ce terme : même longueur, et chaque
 * lettre visible à sa place. « c*nard » peut être « conard ».
 */
export function maskedMatches(masked: string, term: string): boolean {
  if (masked.length !== term.length || !masked.includes('*')) {
    return false;
  }
  for (let index = 0; index < term.length; index += 1) {
    const character = masked[index];
    if (character !== '*' && character !== term[index]) {
      return false;
    }
  }
  // Au moins la moitié des lettres doivent être visibles : « **** » ne dit rien.
  return masked.replace(/\*/g, '').length * 2 >= term.length;
}
