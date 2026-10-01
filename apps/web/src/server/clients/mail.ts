import 'server-only';
import { env } from '../env';

/**
 * Envoi de courriel, par l'API HTTP de Resend.
 *
 * Un appel `fetch` et non la bibliothèque du fournisseur : l'application
 * n'envoie qu'un seul courriel, et une dépendance de plus pour une requête
 * POST ne se justifie pas.
 *
 * Renvoie faux sans lever quand l'envoi échoue : l'appelant répond de la même
 * façon que le compte existe ou non, et une exception trahirait la différence.
 */
export async function sendMail(message: { to: string; subject: string; text: string }): Promise<boolean> {
  const mail = env.mail;
  if (mail === null) {
    return false;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${mail.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: mail.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) {
      console.error('[mail] envoi refuse', response.status);
    }
    return response.ok;
  } catch (error) {
    console.error('[mail] envoi en echec', error);
    return false;
  }
}

export function isMailConfigured(): boolean {
  return env.mail !== null;
}
