export type RecognizeOutcome =
  | { kind: 'names'; names: string[] }
  | { kind: 'too_large' }
  | { kind: 'bad_format' }
  | { kind: 'quota_exceeded' }
  | { kind: 'unavailable' };

/**
 * Envoi d'une photo à la route de reconnaissance (FR-17).
 * Variantes plutôt qu'exceptions (AD-12) : l'interface distingue une image
 * trop lourde d'une réponse hors format et d'un service indisponible.
 */
export async function recognizePhoto(dataUrl: string): Promise<RecognizeOutcome> {
  let response: Response;
  try {
    response = await fetch('/api/recognize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    });
  } catch {
    return { kind: 'unavailable' };
  }

  if (response.status === 413) {
    return { kind: 'too_large' };
  }
  if (response.status === 422) {
    return { kind: 'bad_format' };
  }
  if (response.status === 429) {
    return { kind: 'quota_exceeded' };
  }
  if (!response.ok) {
    return { kind: 'unavailable' };
  }

  const body = (await response.json()) as { names: string[] };
  return { kind: 'names', names: body.names };
}
