/**
 * Les liens, adresses et numéros glissés dans un texte public.
 *
 * Aucun champ public de l'app — pseudo, nom affiché, nom de séance ou
 * d'exercice — n'a de raison de contenir un lien : sa seule présence est
 * déjà un signal de spam. Le reste dit s'il faut s'en inquiéter davantage.
 *
 * Tout est jugé sur la forme, sans réseau : l'âge d'un domaine ou sa
 * réputation demanderaient un service tiers, qui n'est pas branché (voir
 * `DomainReputation` dans `src/server/moderation/providers.ts`). Le nom de
 * domaine seul ne suffit pas à faire confiance : un lien vers un domaine
 * connu reste un lien dans un pseudo.
 */

import type { Detection } from './types';

/** Domaines de premier niveau reconnus pour un domaine écrit sans `http`. */
const KNOWN_TLDS =
  'com|fr|net|org|io|co|me|xyz|top|info|biz|ru|cn|tk|ml|ga|cf|gq|link|click|shop|store|app|dev|be|ch|ca|de|uk|es|it|eu|ly|gl|gg|to|cc|tv|live|online|site|website|club|vip|win|bid|icu|cyou|sbs|zip|mov|rest|pro|ai';

const URL_PATTERN = new RegExp(
  String.raw`(?:https?:\/\/|www\.)[^\s]+|\b(?:[a-z0-9-]+\.)+(?:${KNOWN_TLDS})\b(?:\/[^\s]*)?`,
  'g',
);

/** Raccourcisseurs : la vraie destination est cachée. */
const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'cutt.ly', 'rebrand.ly',
  'shorturl.at', 'rb.gy', 't.ly', 'tiny.cc', 'lnkd.in', 's.id', 'v.gd', 'bitly.com', 'shorte.st', 'adf.ly',
]);

/** Invitations vers une messagerie ou une page de liens : on sort de l'app pour être contacté. */
const MESSAGING = new Set([
  't.me', 'wa.me', 'discord.gg', 'discord.com', 'snapchat.com', 'linktr.ee', 'onlyfans.com', 'm.me', 'chat.whatsapp.com',
]);

/** Domaines de premier niveau surreprésentés dans l'hameçonnage. */
const SUSPICIOUS_TLDS = new Set(['tk', 'ml', 'ga', 'cf', 'gq', 'xyz', 'top', 'click', 'link', 'icu', 'cyou', 'sbs', 'zip', 'mov', 'rest']);

/** Marques imitées, et leurs vrais domaines. */
const BRANDS: Record<string, readonly string[]> = {
  aars: ['aars-app.vercel.app', 'nutri-rosy-one.vercel.app'],
  paypal: ['paypal.com', 'paypal.fr', 'paypal.me'],
  apple: ['apple.com', 'icloud.com'],
  google: ['google.com', 'google.fr'],
  amazon: ['amazon.com', 'amazon.fr'],
  netflix: ['netflix.com'],
  ameli: ['ameli.fr'],
  impots: ['impots.gouv.fr'],
  laposte: ['laposte.fr', 'laposte.net'],
  chronopost: ['chronopost.fr'],
};

const PHONE = /(?:\+|00)\d{2}[\s.-]?\d(?:[\s.-]?\d{2}){4}\b|\b0[1-9](?:[\s.-]?\d{2}){4}\b/;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/;

function hostOf(link: string): string {
  const withoutScheme = link.replace(/^https?:\/\//, '');
  const authority = withoutScheme.split(/[/?#]/)[0] ?? '';
  // `utilisateur@hôte` : ce qui précède l'arobase trompe l'œil, l'hôte est après.
  const host = authority.includes('@') ? (authority.split('@').pop() ?? '') : authority;
  return host.replace(/^www\./, '').replace(/:\d+$/, '').replace(/\.$/, '');
}

/** Les liens d'un texte déjà en forme `plain`. */
export function extractLinks(plain: string): string[] {
  return [...plain.matchAll(URL_PATTERN)].map((match) => match[0]);
}

/** Juge les liens, numéros et adresses d'un texte `plain`. */
export function detectLinks(plain: string): Detection[] {
  const detections: Detection[] = [];
  for (const link of extractLinks(plain)) {
    const host = hostOf(link);
    const labels = host.split('.');
    const tld = labels[labels.length - 1] ?? '';
    const signals = ['link_in_public_text'];
    let category: Detection['category'] = 'spam';
    let severity: Detection['severity'] = 'high';
    let confidence = 0.75;

    if (SHORTENERS.has(host)) {
      signals.push('url_shortener');
      confidence = 0.8;
    }
    if ([...MESSAGING].some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      // Inviter à poursuivre ailleurs, hors de toute modération : du racolage.
      signals.push('messaging_invite');
      confidence = 0.85;
    }
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
      signals.push('ip_literal');
      category = 'scam';
      severity = 'high';
    }
    if (labels.some((label) => label.startsWith('xn--'))) {
      signals.push('punycode');
      category = 'scam';
      severity = 'high';
    }
    if (link.replace(/^https?:\/\//, '').split(/[/?#]/)[0]?.includes('@')) {
      signals.push('userinfo_trick');
      category = 'scam';
      severity = 'high';
    }
    if (SUSPICIOUS_TLDS.has(tld)) {
      signals.push('suspicious_tld');
      confidence = Math.max(confidence, 0.8);
    }
    if (labels.length >= 5) {
      signals.push('deep_subdomains');
    }
    for (const [brand, official] of Object.entries(BRANDS)) {
      const imitates = host.includes(brand) && !official.some((domain) => host === domain || host.endsWith(`.${domain}`));
      if (imitates) {
        signals.push('brand_lookalike');
        category = 'scam';
        severity = 'high';
        confidence = 0.9;
      }
    }
    detections.push({ source: 'links', category, severity, confidence, signals });
  }
  if (PHONE.test(plain)) {
    detections.push({ source: 'links', category: 'spam', severity: 'high', confidence: 0.75, signals: ['phone_number'] });
  }
  if (EMAIL.test(plain)) {
    detections.push({ source: 'links', category: 'spam', severity: 'high', confidence: 0.75, signals: ['email_address'] });
  }
  return detections;
}
