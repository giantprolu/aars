/**
 * Le lexique des règles locales, en français et en anglais.
 *
 * Ce fichier contient des insultes et des injures, parce qu'on ne peut pas
 * reconnaître ce qu'on refuse d'écrire. Il n'est qu'un filet : le modèle de
 * modération voit bien plus large. Il sert à décider seul quand le modèle ne
 * répond pas, et à ne jamais laisser passer le plus grave.
 *
 * Le dépôt étant public, ce lexique l'est aussi : quelqu'un peut le lire pour
 * l'éviter. C'est accepté, parce que la normalisation déjoue les déguisements
 * courants et que le modèle ne dépend pas de cette liste.
 *
 * `confidence` dit à quel point le terme suffit seul. Un mot à double sens
 * (« tapette », « pd ») reste sous le seuil qui masque : il ouvre une revue,
 * il ne sanctionne pas. `embed` autorise la recherche à l'intérieur d'un mot
 * (« xconnardx ») : seulement pour les termes qui ne sont le morceau d'aucun
 * mot courant.
 */

import type { ModerationCategory, Severity } from './types';

export interface LexiconEntry {
  term: string;
  category: ModerationCategory;
  severity: Severity;
  confidence: number;
  embed?: boolean;
}

type Row = [term: string, severity: Severity, confidence: number, embed?: 'embed'];

function group(category: ModerationCategory, rows: readonly Row[]): LexiconEntry[] {
  return rows.map(([term, severity, confidence, embed]) => ({
    term,
    category,
    severity,
    confidence,
    ...(embed === 'embed' ? { embed: true } : {}),
  }));
}

export const LEXICON: readonly LexiconEntry[] = [
  ...group('harassment', [
    ['connard', 'high', 0.85, 'embed'],
    ['connasse', 'high', 0.85, 'embed'],
    ['salope', 'high', 0.85, 'embed'],
    ['pute', 'high', 0.8],
    ['fils de pute', 'high', 0.9],
    ['fdp', 'high', 0.8],
    ['encule', 'high', 0.85, 'embed'],
    ['nique ta mere', 'high', 0.9],
    ['ntm', 'high', 0.75],
    ['nique ta race', 'high', 0.9],
    ['ferme ta gueule', 'high', 0.8],
    ['ta gueule', 'medium', 0.7],
    ['ftg', 'medium', 0.7],
    ['batard', 'high', 0.8],
    ['pauvre con', 'high', 0.8],
    ['gros con', 'high', 0.8],
    ['sale con', 'high', 0.8],
    ['petite merde', 'high', 0.8],
    ['sac a merde', 'high', 0.85],
    ['abruti', 'medium', 0.6],
    ['debile', 'medium', 0.6],
    ['cretin', 'medium', 0.6],
    ['gros lard', 'high', 0.8],
    ['grosse truie', 'high', 0.85],
    ['grosse vache', 'high', 0.8],
    ['gros porc', 'high', 0.8],
    ['grosse baleine', 'high', 0.8],
    ['t es moche', 'medium', 0.7],
    ['va mourir', 'high', 0.8],
    ['va crever', 'high', 0.8],
    ['suicide toi', 'severe', 0.9],
    ['tue toi', 'severe', 0.9],
    ['va te pendre', 'severe', 0.9],
    ['va te tuer', 'severe', 0.85],
    ['kys', 'severe', 0.85],
    ['kill yourself', 'severe', 0.9],
    ['go die', 'high', 0.8],
    ['bitch', 'high', 0.8],
    ['asshole', 'high', 0.8, 'embed'],
    ['cunt', 'high', 0.85],
    ['motherfucker', 'high', 0.85, 'embed'],
    ['son of a bitch', 'high', 0.85],
    ['whore', 'high', 0.85],
    ['slut', 'high', 0.85],
    ['fuck you', 'high', 0.8],
    ['fuck off', 'medium', 0.7],
    ['dumbass', 'medium', 0.7],
    ['fat pig', 'high', 0.8],
    ['fat cow', 'high', 0.8],
    ['loser', 'low', 0.5],
  ]),
  ...group('hate', [
    ['negro', 'severe', 0.9],
    ['negre', 'severe', 0.9],
    ['bougnoule', 'severe', 0.95, 'embed'],
    ['bicot', 'severe', 0.9],
    ['youpin', 'severe', 0.95, 'embed'],
    ['youtre', 'severe', 0.95],
    ['bamboula', 'severe', 0.85],
    ['chinetoque', 'severe', 0.95, 'embed'],
    ['niakoue', 'severe', 0.95, 'embed'],
    ['sale noir', 'severe', 0.9],
    ['sale juif', 'severe', 0.95],
    ['sale arabe', 'severe', 0.95],
    ['sale musulman', 'severe', 0.95],
    ['sale chinois', 'severe', 0.9],
    ['sale asiat', 'severe', 0.9],
    ['sale rebeu', 'severe', 0.9],
    ['sale renoi', 'severe', 0.9],
    ['sale blanc', 'high', 0.85],
    ['sale pd', 'severe', 0.9],
    ['sale gay', 'severe', 0.9],
    ['sale gouine', 'severe', 0.9],
    ['sale lesbienne', 'severe', 0.9],
    ['sale trans', 'severe', 0.9],
    ['sale femme', 'high', 0.8],
    ['pede', 'high', 0.85],
    ['pd', 'medium', 0.65],
    ['tapette', 'high', 0.6],
    ['tarlouze', 'high', 0.9, 'embed'],
    ['tantouze', 'high', 0.9, 'embed'],
    ['gouine', 'high', 0.8],
    ['travelo', 'high', 0.85, 'embed'],
    ['attarde', 'medium', 0.6],
    ['mongol', 'low', 0.45],
    ['mort aux juifs', 'critical', 0.95],
    ['mort aux arabes', 'critical', 0.95],
    ['mort aux noirs', 'critical', 0.95],
    ['mort aux musulmans', 'critical', 0.95],
    ['mort aux gays', 'critical', 0.95],
    ['mort aux pd', 'critical', 0.95],
    ['mort aux blancs', 'severe', 0.9],
    ['nigger', 'severe', 0.95, 'embed'],
    ['nigga', 'high', 0.7],
    ['faggot', 'severe', 0.95, 'embed'],
    ['fag', 'high', 0.8],
    ['kike', 'severe', 0.9],
    ['spic', 'high', 0.75],
    ['chink', 'severe', 0.85],
    ['tranny', 'high', 0.85],
    ['retard', 'high', 0.7],
    ['white power', 'severe', 0.9],
    ['white pride', 'high', 0.7],
    ['heil hitler', 'severe', 0.95],
    ['sieg heil', 'severe', 0.95],
    ['1488', 'severe', 0.9],
    ['14 88', 'severe', 0.85],
    ['gas the jews', 'critical', 0.95],
  ]),
  ...group('threat', [
    ['te faire la peau', 'high', 0.8],
    ['vive daech', 'severe', 0.9],
    ['vive daesh', 'severe', 0.9],
    ['vive l etat islamique', 'severe', 0.9],
  ]),
  ...group('sexual', [
    ['porn', 'high', 0.8],
    ['porno', 'high', 0.8],
    ['xxx', 'medium', 0.6],
    ['nsfw', 'medium', 0.6],
    ['nudes', 'high', 0.75],
    ['envoie nudes', 'high', 0.85],
    ['envoie des nudes', 'high', 0.85],
    ['dick pic', 'high', 0.85],
    ['plan cul', 'high', 0.7],
    ['baise moi', 'high', 0.85],
    ['suce moi', 'high', 0.85],
    ['suce ma', 'high', 0.85],
    ['branle', 'high', 0.75],
    ['nichons', 'high', 0.75],
    ['seins nus', 'high', 0.7],
    ['bite', 'medium', 0.5],
    ['escort', 'medium', 0.6],
    ['rencontre coquine', 'medium', 0.7],
  ]),
  ...group('minor_safety', [
    ['pedo', 'critical', 0.6],
    ['pedophile', 'critical', 0.6],
    ['pthc', 'critical', 0.95, 'embed'],
    ['child porn', 'critical', 0.95],
    ['pedoporno', 'critical', 0.95, 'embed'],
    ['jailbait', 'critical', 0.9, 'embed'],
    ['lolicon', 'critical', 0.9, 'embed'],
    ['shotacon', 'critical', 0.9, 'embed'],
    ['enfant nu', 'critical', 0.85],
    ['enfants nus', 'critical', 0.85],
    ['ado nue', 'critical', 0.85],
    ['teen nude', 'critical', 0.85],
    ['preteen', 'critical', 0.7],
    ['loli', 'critical', 0.5],
  ]),
  ...group('scam', [
    ['bitcoin', 'medium', 0.6],
    ['crypto', 'low', 0.45],
    ['forex', 'medium', 0.55],
    ['investissement garanti', 'high', 0.8],
    ['argent facile', 'high', 0.8],
    ['gagne de l argent', 'medium', 0.7],
    ['gagner de l argent', 'medium', 0.7],
    ['revenu passif', 'medium', 0.65],
    ['double ton argent', 'high', 0.85],
    ['giveaway', 'medium', 0.6],
    ['cadeau gratuit', 'medium', 0.6],
    ['free money', 'high', 0.8],
    ['western union', 'high', 0.8],
    ['envoie moi de l argent', 'high', 0.8],
    ['paypal moi', 'medium', 0.7],
    ['cashapp', 'medium', 0.6],
    ['sugar daddy', 'medium', 0.7],
    ['recharge pcs', 'high', 0.85],
    ['coupon pcs', 'high', 0.85],
    ['neosurf', 'high', 0.8],
    ['transcash', 'high', 0.8],
  ]),
  ...group('self_promotion', [
    ['code promo', 'medium', 0.7],
    ['lien en bio', 'medium', 0.7],
    ['link in bio', 'medium', 0.7],
    ['onlyfans', 'high', 0.8, 'embed'],
    ['abonne toi', 'medium', 0.6],
    ['abonnez vous', 'medium', 0.6],
    ['follow me', 'medium', 0.55],
    ['follow for follow', 'medium', 0.7],
    ['f4f', 'medium', 0.65],
    ['dm moi', 'medium', 0.55],
    ['dm pour', 'medium', 0.6],
    ['whatsapp', 'medium', 0.6],
    ['telegram', 'medium', 0.6],
    ['snapchat', 'medium', 0.5],
  ]),
  ...group('self_harm', [
    ['pro ana', 'high', 0.85],
    ['proana', 'high', 0.85, 'embed'],
    ['pro mia', 'high', 0.85],
    ['promia', 'high', 0.85, 'embed'],
    ['thinspo', 'high', 0.85, 'embed'],
    ['thinspiration', 'high', 0.85, 'embed'],
    ['bonespo', 'high', 0.85, 'embed'],
    ['meanspo', 'high', 0.85, 'embed'],
    ['skinny goals', 'medium', 0.6],
    ['je veux mourir', 'high', 0.8],
    ['envie de mourir', 'high', 0.8],
    ['me suicider', 'high', 0.85],
    ['suicide', 'medium', 0.6],
    ['me tuer', 'medium', 0.6],
    ['scarification', 'medium', 0.7],
    ['me scarifier', 'high', 0.85],
    ['automutilation', 'medium', 0.7],
    ['me faire vomir', 'high', 0.85],
    ['ne plus manger', 'medium', 0.7],
    ['arreter de manger', 'medium', 0.7],
  ]),
];

/** Les mots qui, à côté d'un produit, font d'un nom une annonce de vente. */
export const SALE_WORDS = /\b(vend|vends|vente|a vendre|achat|achete|dispo|livraison|prix|plug|for sale|selling)\b/;

/** Ce qui ne se vend pas, par famille. */
export const CONTROLLED_PRODUCTS: readonly { pattern: RegExp; signal: string }[] = [
  {
    pattern: /\b(steroides?|anabolisants?|anabo|tren|trenbolone|dianabol|dbol|winstrol|testo|testosterone|sarms?|clenbuterol|hgh)\b/,
    signal: 'doping_sale',
  },
  {
    pattern: /\b(coke|cocaine|weed|beuh|resine|mdma|ecstasy|xtc|lsd|keta|ketamine|heroine|crack|3mmc|ghb)\b/,
    signal: 'drug_sale',
  },
  { pattern: /\b(arme|armes|flingue|pistolet|kalash|kalachnikov|glock)\b/, signal: 'weapon_sale' },
];

/** Se faire passer pour l'équipe : réservé aux noms de personne. */
export const IMPERSONATION =
  /\b(admin|administrateur|administratrice|moderateur|moderatrice|moderation|support|staff|service client|equipe aars|team aars|aars officiel|officiel aars|aars support|support aars)\b/;
