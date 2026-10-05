'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiSend } from '@/lib/api';
import { requireSession } from '@/lib/auth';

const SIMPLE = ['take', 'hide', 'restore', 'reset_identity'] as const;
const WITH_NOTE = ['confirm', 'dismiss'] as const;
const SANCTIONS = ['warning', 'restriction', 'suspension', 'ban'] as const;

function failure(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Le serveur Aars ne répond pas.';
}

/** Le retour vers le dossier, avec le message à afficher en tête. */
function back(id: number, message: string, ok: boolean): never {
  revalidatePath('/moderation');
  redirect(`/moderation/${id}?${new URLSearchParams({ message, ok: ok ? '1' : '0' })}`);
}

/**
 * Une décision sur un dossier. La version du dossier lue à l'affichage part
 * avec elle : si le dossier a bougé depuis, le serveur refuse et rien n'est
 * écrit.
 */
export async function decide(form: FormData): Promise<void> {
  await requireSession();
  const id = Number(form.get('id'));
  const version = String(form.get('version') ?? '');
  const action = String(form.get('action') ?? '');
  if (!Number.isInteger(id) || id <= 0) {
    return;
  }

  let decision: Record<string, unknown> | null = null;
  if ((SIMPLE as readonly string[]).includes(action)) {
    decision = { action };
  } else if ((WITH_NOTE as readonly string[]).includes(action)) {
    const note = String(form.get('note') ?? '').trim();
    decision = { action, note: note === '' ? null : note };
  } else if (action === 'sanction') {
    const sanction = String(form.get('sanction') ?? '');
    const days = form.get('days') === null ? null : Number(form.get('days'));
    if ((SANCTIONS as readonly string[]).includes(sanction)) {
      decision = { action, sanction, days };
    }
  }
  if (decision === null) {
    back(id, 'Geste inconnu.', false);
  }

  let message = 'Décision enregistrée.';
  let ok = true;
  try {
    await apiSend('POST', `/moderation/cases/${id}`, { version, decision });
  } catch (error) {
    message = failure(error);
    ok = false;
  }
  back(id, message, ok);
}

/** Lève une sanction ; « annuler » retire aussi le strike de l'historique. */
export async function lift(form: FormData): Promise<void> {
  await requireSession();
  const id = Number(form.get('caseId'));
  const sanctionId = Number(form.get('sanctionId'));
  if (!Number.isInteger(id) || !Number.isInteger(sanctionId) || sanctionId <= 0) {
    return;
  }
  let message = 'Sanction levée.';
  let ok = true;
  try {
    await apiSend('POST', `/moderation/sanctions/${sanctionId}`, {
      action: 'lift',
      void: form.get('void') === '1',
      reason: null,
    });
  } catch (error) {
    message = failure(error);
    ok = false;
  }
  back(id, message, ok);
}
