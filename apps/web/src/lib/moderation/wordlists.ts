/**
 * Les listes ouvertes de mots grossiers, en 28 langues.
 *
 * Source : « List of Dirty, Naughty, Obscene, and Otherwise Bad Words »
 * (LDNOOBW, https://github.com/LDNOOBW), paquet npm `naughty-words`, sous
 * licence CC-BY-4.0 : l'attribution figure dans `docs/MODERATION.md`.
 *
 * Ces listes ne disent ni la catégorie ni la gravité d'un mot, et mêlent
 * l'injure au simple vocabulaire du corps. Elles ne servent donc que de
 * signal : un mot trouvé ici ouvre une revue humaine, il ne masque rien et ne
 * sanctionne personne. Le lexique classé (`lexicon.ts`) l'emporte toujours.
 *
 * Certains mots de la liste française sont ordinaires dans une app de sport
 * ou dans la langue courante (« pédale », « folle », « bourré »…) : ils sont
 * écartés par `ORDINARY_WORDS`.
 */

import ar from 'naughty-words/ar.json';
import cs from 'naughty-words/cs.json';
import da from 'naughty-words/da.json';
import de from 'naughty-words/de.json';
import en from 'naughty-words/en.json';
import eo from 'naughty-words/eo.json';
import es from 'naughty-words/es.json';
import fa from 'naughty-words/fa.json';
import fi from 'naughty-words/fi.json';
import fil from 'naughty-words/fil.json';
import fr from 'naughty-words/fr.json';
import frCa from 'naughty-words/fr-CA-u-sd-caqc.json';
import hi from 'naughty-words/hi.json';
import hu from 'naughty-words/hu.json';
import it from 'naughty-words/it.json';
import ja from 'naughty-words/ja.json';
import kab from 'naughty-words/kab.json';
import ko from 'naughty-words/ko.json';
import nl from 'naughty-words/nl.json';
import no from 'naughty-words/no.json';
import pl from 'naughty-words/pl.json';
import pt from 'naughty-words/pt.json';
import ru from 'naughty-words/ru.json';
import sv from 'naughty-words/sv.json';
import th from 'naughty-words/th.json';
import tlh from 'naughty-words/tlh.json';
import tr from 'naughty-words/tr.json';
import zh from 'naughty-words/zh.json';
import { foldTerm, plainTerm } from './normalize';

const LISTS: Record<string, readonly string[]> = {
  ar, cs, da, de, en, eo, es, fa, fi, fil, fr, 'fr-CA': frCa, hi, hu, it, ja, kab, ko, nl, no, pl, pt, ru, sv, th, tlh, tr, zh,
};

/**
 * Mots des listes qui n'ont rien d'abusif ici, sous leur forme repliée :
 * vocabulaire du vélo et du sport, mots d'enfants, jurons sans cible, mots
 * ordinaires en français ou en anglais qui sont grossiers dans une autre
 * langue, et les mots qui désignent une orientation ou une identité — les
 * signaler serait discriminer ceux qui les emploient pour eux-mêmes.
 */
const ORDINARY_WORDS = new Set(
  [
    // Français : usage courant, vélo, enfance, jurons sans cible.
    'pédale', 'folle', 'grande folle', 'tanche', 'bourré', 'bourrée', 'meuf', 'gerbe', 'gerber', 'péter',
    'pipi', 'caca', 'bordel', 'merde', 'chier', 'trique', 'jouir', 'baiser', 'ménage à trois', 'suce',
    'gueule', 'con', 'conne', 'cons', 'déconne', 'déconner', 'emmerder', 'emmerdant', 'foutre', 'bander',
    'zizi', 'chiottes', 'chiasse', 'putain', 'cul', 'teuch', 'ramoner', 'brouter le cresson', 'domination',
    // Anglais courant.
    'anal', 'anus', 'bum', 'butt', 'damn', 'hell', 'crap', 'sexy', 'nude', 'nudity', 'strip', 'bang',
    'bob', 'bobs', 'domes', 'scat', 'suck', 'sucks', 'pon', 'escort', 'inferno', 'poker', 'satan',
    // Identités et orientations.
    'sexual', 'sexualy', 'sexuality', 'homosexual', 'bisexual', 'heterosexual', 'homoerotic',
    // Mots ordinaires ailleurs (monnaie, coquillage, pétard).
    'concha', 'pataca', 'pataka',
    // « fan », un juron norvégien, et un admirateur partout ailleurs.
    'fan',
  ].map(foldTerm),
);

/**
 * Longueur minimale d'un mot seul, par langue à alphabet latin. En français
 * et en anglais, les langues de l'app, les listes sont lisibles et relues ;
 * ailleurs, un mot court grossier dans une langue est souvent un mot banal
 * dans une autre (« mal », « pot », « and »), et seuls les mots longs gardent
 * assez de sens pour valoir une revue.
 */
const MIN_WORD_LENGTH: Record<string, number> = { en: 4, fr: 4, 'fr-CA': 4 };
const FOREIGN_MIN_WORD_LENGTH = 6;

/** Écritures sans espaces entre les mots : on cherche à l'intérieur du texte. */
const UNSPACED = new Set(['ja', 'zh', 'th']);

export interface ListEntry {
  /** La forme à chercher. */
  term: string;
  /**
   * `folded` : mot ou phrase entière dans le texte replié ;
   * `plain` : mot ou phrase entière dans le texte `plain`, pour les écritures non latines ;
   * `substring` : à l'intérieur du texte, pour les écritures sans espaces.
   */
  form: 'folded' | 'plain' | 'substring';
  language: string;
}

function compile(): ListEntry[] {
  const seen = new Set<string>();
  const entries: ListEntry[] = [];
  for (const [language, words] of Object.entries(LISTS)) {
    for (const word of words) {
      const latin = /[a-z]/i.test(word) && !/[^\p{Script=Latin}\p{N}\p{P}\p{Zs}\p{M}]/u.test(word);
      const term = latin ? foldTerm(word) : plainTerm(word);
      const phrase = term.includes(' ');
      const minimum = MIN_WORD_LENGTH[language] ?? FOREIGN_MIN_WORD_LENGTH;
      const tooShort = latin ? !phrase && term.length < minimum : [...term].length < 2;
      if (term === '' || tooShort || (latin && ORDINARY_WORDS.has(term))) {
        continue;
      }
      const form: ListEntry['form'] = latin ? 'folded' : UNSPACED.has(language) ? 'substring' : 'plain';
      const key = `${form}:${term}`;
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({ term, form, language });
      }
    }
  }
  return entries;
}

let compiled: ListEntry[] | null = null;

/** Les entrées, repliées une fois pour toutes au premier usage. */
export function openWordList(): readonly ListEntry[] {
  compiled ??= compile();
  return compiled;
}
