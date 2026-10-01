import 'server-only';
import { Mistral } from '@mistralai/mistralai';
import { MistralError } from '@mistralai/mistralai/models/errors';
import { env, requireEnv } from '../env';
import {
  MAX_TOKENS,
  SYSTEM_PROMPT,
  USER_PROMPT,
  parseNames,
  type RecognizeResult,
} from './vision';

/**
 * Reconnaissance d'aliments par l'API Mistral (FR-17, AD-4).
 *
 * Seul module de l'application autorisé à importer le SDK Mistral. La clé
 * n'a pas de préfixe `NEXT_PUBLIC_` et ne franchit jamais la frontière
 * serveur : le navigateur envoie une image à /api/recognize et reçoit un
 * tableau de chaînes, rien d'autre.
 *
 * La consigne et l'analyse de la réponse sont communes à tous les
 * fournisseurs et vivent dans `vision.ts`.
 */

/** Vrai pour les pannes qu'une seconde tentative immédiate peut lever. */
function isTransient(error: unknown): boolean {
  if (error instanceof MistralError) {
    return error.statusCode >= 500;
  }
  // Coupure réseau ou délai dépassé : pas de réponse HTTP du tout.
  return true;
}

function isQuotaExceeded(error: unknown): boolean {
  return error instanceof MistralError && (error.statusCode === 429 || error.statusCode === 402);
}

export async function recognizeWithMistral(
  imageDataUrl: string,
): Promise<RecognizeResult> {
  let apiKey: string;
  try {
    apiKey = requireEnv('MISTRAL_API_KEY');
  } catch {
    // Clé absente : blocage de configuration, pas une panne du service (B-3).
    return { kind: 'unavailable' };
  }

  const client = new Mistral({ apiKey });

  async function ask(): Promise<unknown> {
    const response = await client.chat.complete({
      model: env.mistralModel,
      temperature: 0,
      maxTokens: MAX_TOKENS,
      responseFormat: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: USER_PROMPT },
            { type: 'image_url', imageUrl: imageDataUrl },
          ],
        },
      ],
    });
    return response.choices?.[0]?.message?.content;
  }

  let content: unknown;
  try {
    content = await ask();
  } catch (error) {
    if (isQuotaExceeded(error)) {
      // Distinguer le quota de la panne : l'un se règle sur le compte Mistral,
      // l'autre passe tout seul. Les confondre laissait l'utilisateur réessayer
      // une photo qui ne pouvait pas aboutir.
      console.error('[recognize] quota du modele epuise', error);
      return { kind: 'quota_exceeded' };
    }
    if (!isTransient(error)) {
      console.error('[recognize] appel au modele refuse', error);
      return { kind: 'unavailable' };
    }
    // Une seule seconde tentative : au-delà, l'utilisateur attend trop
    // longtemps devant une photo pour un service qui ne revient pas.
    try {
      content = await ask();
    } catch (retryError) {
      // Aucune erreur brute du SDK n'est propagée au client (AD-4).
      console.error('[recognize] appel au modele en echec', retryError);
      return isQuotaExceeded(retryError)
        ? { kind: 'quota_exceeded' }
        : { kind: 'unavailable' };
    }
  }

  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map((chunk) =>
              typeof chunk === 'object' && chunk !== null && 'text' in chunk
                ? String((chunk as { text: unknown }).text)
                : '',
            )
            .join('')
        : '';

  const names = parseNames(text);
  return names === null ? { kind: 'bad_format' } : { kind: 'recognized', names };
}
