import 'server-only';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import type { Readable } from 'node:stream';

/**
 * Lecture d'une page de recette, pour l'import (Cuisine+).
 *
 * C'est la seule requête du serveur vers une adresse que donne un
 * utilisateur, et elle est gardée en conséquence : sans garde, « importer une
 * recette » ouvrirait au premier venu le réseau interne de l'hébergeur
 * (métadonnées du nuage, services privés), depuis notre serveur.
 *
 * - http ou https seulement, ports par défaut, sans identifiants dans l'adresse ;
 * - l'adresse IP est contrôlée au moment de la connexion, dans la résolution
 *   DNS elle-même, et non avant : un nom qui change d'adresse entre le
 *   contrôle et la connexion (rebinding) ne passe pas ;
 * - les redirections sont suivies à la main, trois au plus, chacune contrôlée ;
 * - la réponse est bornée en temps et en taille, décompression comprise.
 *
 * `fetch` n'est pas employé : il ne laisse pas la main sur la résolution.
 */

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const USER_AGENT = 'Mozilla/5.0 (compatible; NutriPerso/1.0; import de recette)';

/** Les plages qu'une page publique n'occupe jamais. */
const PRIVATE = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  PRIVATE.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  PRIVATE.addSubnet(network, prefix, 'ipv6');
}

/** Vrai si l'adresse est publique. Une IPv4 encapsulée en IPv6 est relue en IPv4. */
export function isPublicAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped?.[1] !== undefined) {
    return isPublicAddress(mapped[1]);
  }
  const family = isIP(address);
  if (family === 0) {
    return false;
  }
  return !PRIVATE.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/** La résolution DNS, qui refuse toute adresse non publique. */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
    if (error) {
      callback(error, '', 0);
      return;
    }
    const allowed = addresses.filter((item) => isPublicAddress(item.address));
    if (allowed.length === 0 || allowed.length !== addresses.length) {
      callback(Object.assign(new Error('adresse non publique'), { code: 'EBLOCKED' }), '', 0);
      return;
    }
    if (options.all) {
      callback(null, allowed);
    } else {
      const first = allowed[0]!;
      callback(null, first.address, first.family);
    }
  });
};

export type PageResult =
  | { kind: 'ok'; html: string; url: string }
  | { kind: 'invalid_url' }
  | { kind: 'unreachable' };

/** Une adresse qu'on accepte de lire, ou `null`. */
export function acceptableUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }
  if (url.username !== '' || url.password !== '' || url.port !== '') {
    return null;
  }
  // Une IP écrite en clair est contrôlée ici ; un nom l'est à la connexion.
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0 && !isPublicAddress(host)) {
    return null;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    return null;
  }
  return url;
}

function decoded(response: http.IncomingMessage): Readable {
  switch ((response.headers['content-encoding'] ?? '').toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return response.pipe(createGunzip());
    case 'br':
      return response.pipe(createBrotliDecompress());
    case 'deflate':
      return response.pipe(createInflate());
    default:
      return response;
  }
}

function charsetOf(contentType: string | undefined): string {
  const match = /charset\s*=\s*"?([\w-]+)/i.exec(contentType ?? '');
  const charset = (match?.[1] ?? 'utf-8').toLowerCase();
  try {
    new TextDecoder(charset);
    return charset;
  } catch {
    return 'utf-8';
  }
}

type Hop = { kind: 'page'; html: string } | { kind: 'redirect'; location: string } | { kind: 'failed' };

function readOnce(url: URL, deadline: number): Promise<Hop> {
  return new Promise((settle) => {
    // Une borne sur l'échange entier, et non sur le silence entre deux paquets :
    // une page servie au compte-gouttes ne doit pas tenir la fonction ouverte.
    const timer = setTimeout(() => {
      request.destroy();
      settle({ kind: 'failed' });
    }, Math.max(1, deadline - Date.now()));
    const resolve = (hop: Hop): void => {
      clearTimeout(timer);
      settle(hop);
    };
    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(
      url,
      {
        lookup: guardedLookup,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
          'accept-encoding': 'gzip, br, deflate',
          'accept-language': 'fr-FR,fr;q=0.9,en;q=0.5',
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          resolve({ kind: 'redirect', location: response.headers.location });
          return;
        }
        const type = response.headers['content-type'] ?? '';
        if (status !== 200 || !/html|xml/i.test(type)) {
          response.resume();
          resolve({ kind: 'failed' });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        const body = decoded(response);
        body.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            request.destroy();
            body.destroy();
            resolve({ kind: 'failed' });
            return;
          }
          chunks.push(chunk);
        });
        body.on('end', () => {
          resolve({ kind: 'page', html: new TextDecoder(charsetOf(type)).decode(Buffer.concat(chunks)) });
        });
        body.on('error', () => resolve({ kind: 'failed' }));
      },
    );
    request.on('error', () => resolve({ kind: 'failed' }));
  });
}

/** Lit la page, en suivant au plus trois redirections, chacune contrôlée. */
export async function fetchRecipePage(raw: string): Promise<PageResult> {
  let url = acceptableUrl(raw);
  if (url === null) {
    return { kind: 'invalid_url' };
  }
  const deadline = Date.now() + TIMEOUT_MS;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const result = await readOnce(url, deadline);
    if (result.kind === 'page') {
      return { kind: 'ok', html: result.html, url: url.toString() };
    }
    if (result.kind === 'failed' || Date.now() >= deadline) {
      return { kind: 'unreachable' };
    }
    let next: URL | null;
    try {
      next = acceptableUrl(new URL(result.location, url).toString());
    } catch {
      next = null;
    }
    if (next === null) {
      return { kind: 'unreachable' };
    }
    url = next;
  }
  return { kind: 'unreachable' };
}
