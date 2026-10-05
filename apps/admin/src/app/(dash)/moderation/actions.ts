'use server';

import { revalidatePath } from 'next/cache';
import { apiSend } from '@/lib/api';
import { requireSession } from '@/lib/auth';

/** Clore un signalement, ou rendre privée la séance signalée. */
export async function moderate(form: FormData): Promise<void> {
  await requireSession();
  const id = Number(form.get('id'));
  const action = form.get('action');
  if (!Number.isInteger(id) || id <= 0 || (action !== 'resolve' && action !== 'hide-session')) {
    return;
  }
  await apiSend('POST', `/reports/${id}`, { action });
  revalidatePath('/moderation');
}
