import 'server-only';
import { env, requireEnv } from '../env';
import {
  MAX_TOKENS,
  SYSTEM_PROMPT,
  USER_PROMPT,
  parseNames,
  splitDataUrl,
  type RecognizeResult,
} from './vision';

/**
 * Reconnaissance d'aliments par l'API Gemini (FR-17, AD-4).
 *
 * Appelée en REST plutôt qu'avec le SDK Google : la requête tient en un objet
 * JSON, et l'application parle déjà à Open Food Facts avec `fetch`. Une
 * dépendance de plus pour trois champs ne se justifierait pas.
 *
 * La clé ne porte pas de préfixe `NEXT_PUBLIC_` et ne franchit jamais la
 * frontière serveur. Elle voyage en en-tête `x-goog-api-key` et non dans la
 * chaîne de requête, où elle finirait dans les journaux d'accès de tous les
 * intermédiaires.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Le palier gratuit répond très souvent 503 « high demand » : sur huit appels
 * de vérification, cinq ont été refusés ainsi, sur quatre modèles différents.
 * Ce n'est pas une panne mais une file d'attente, et une seule tentative
 * laisserait l'utilisateur devant un échec la plupart du temps.
 */
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [500, 1500];

/** Au-delà, l'utilisateur attend trop longtemps devant sa photo. */
const TIMEOUT_MS = 30_000;

/**
 * La forme attendue est imposée au modèle plutôt que demandée.
 * Gemini garantit alors un JSON conforme, ce qui rend le cas « réponse
 * inexploitable » quasi impossible sans supprimer l'analyse défensive.
 */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    aliments: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['aliments'],
} as const;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { code?: number; message?: string; status?: string };
}

type Attempt =
  | { kind: 'text'; text: string }
  | { kind: 'retry'; reason: string }
  | { kind: 'quota' }
  | { kind: 'fatal'; reason: string };

async function askOnce(apiKey: string, mimeType: string, base64: string): Promise<Attempt> {
  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${env.geminiModel}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: 'user',
            parts: [
              { text: USER_PROMPT },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: MAX_TOKENS,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
  } catch (error) {
    // Coupure réseau ou délai dépassé : pas de réponse HTTP du tout.
    return { kind: 'retry', reason: error instanceof Error ? error.name : 'reseau' };
  }

  if (response.status === 429) {
    return { kind: 'quota' };
  }

  // 503 « high demand » sur le palier gratuit, 500 côté Google : ça repasse.
  if (response.status >= 500) {
    return { kind: 'retry', reason: `HTTP ${response.status}` };
  }

  let body: GeminiResponse;
  try {
    body = (await response.json()) as GeminiResponse;
  } catch {
    return { kind: 'fatal', reason: 'reponse illisible' };
  }

  if (!response.ok) {
    // Le message de Google est précieux ici : un 404 nomme le modèle de
    // remplacement quand celui configuré n'est plus servi aux comptes récents.
    return {
      kind: 'fatal',
      reason: `HTTP ${response.status} ${body.error?.message ?? ''}`.trim(),
    };
  }

  const text = (body.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('');

  return { kind: 'text', text };
}

export async function recognizeWithGemini(
  imageDataUrl: string,
): Promise<RecognizeResult> {
  let apiKey: string;
  try {
    apiKey = requireEnv('GEMINI_API_KEY');
  } catch {
    // Clé absente : blocage de configuration, pas une panne du service.
    console.error('[recognize] GEMINI_API_KEY absente');
    return { kind: 'unavailable' };
  }

  const image = splitDataUrl(imageDataUrl);
  if (image === null) {
    return { kind: 'bad_format' };
  }

  let lastReason = '';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const result = await askOnce(apiKey, image.mimeType, image.base64);

    if (result.kind === 'text') {
      const names = parseNames(result.text);
      return names === null
        ? { kind: 'bad_format' }
        : { kind: 'recognized', names };
    }

    if (result.kind === 'quota') {
      // Sur le palier gratuit, 429 signale la limite par minute ou par jour :
      // réessayer tout de suite ne ferait que la creuser.
      console.error('[recognize] quota Gemini atteint');
      return { kind: 'quota_exceeded' };
    }

    if (result.kind === 'fatal') {
      console.error('[recognize] appel Gemini refuse :', result.reason);
      return { kind: 'unavailable' };
    }

    lastReason = result.reason;
    const pause = BACKOFF_MS[attempt];
    if (pause !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, pause));
    }
  }

  console.error(`[recognize] Gemini indisponible apres ${MAX_ATTEMPTS} tentatives :`, lastReason);
  return { kind: 'unavailable' };
}
