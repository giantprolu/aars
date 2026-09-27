/** Appel navigateur vers la route des pesées (AD-12). */

export type WeighInOutcome = { kind: 'ok'; profileUpdated: boolean } | { kind: 'error' };

export async function saveWeighIn(weightKg: number): Promise<WeighInOutcome> {
  try {
    const response = await fetch('/api/weight', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ weightKg }),
    });
    if (!response.ok) {
      return { kind: 'error' };
    }
    const body = (await response.json()) as { profileUpdated: boolean };
    return { kind: 'ok', profileUpdated: body.profileUpdated };
  } catch {
    return { kind: 'error' };
  }
}
