/**
 * Abonnement aux notifications depuis le navigateur.
 *
 * Tout passe par le service worker, qui seul reçoit les notifications quand
 * l'application est fermée. Sur iPhone, `PushManager` n'existe que dans
 * l'application installée sur l'écran d'accueil : dans Safari, l'écran le dit
 * au lieu de proposer un interrupteur qui ne marcherait pas.
 */

export type PushSupport = 'supported' | 'install_required' | 'unsupported';

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return 'unsupported';
  }
  if ('PushManager' in window && 'Notification' in window) {
    return 'supported';
  }
  // iOS sans installation : Safari n'expose pas l'API tant que l'app n'est pas
  // ouverte depuis l'écran d'accueil.
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'install_required' : 'unsupported';
}

/** La clé publique VAPID, de base64url en octets, comme l'attend `subscribe`. */
function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64Url}${'='.repeat((4 - (base64Url.length % 4)) % 4)}`
    .replaceAll('-', '+')
    .replaceAll('_', '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'supported') {
    return null;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  return registration === undefined ? null : registration.pushManager.getSubscription();
}

export type EnableOutcome = 'enabled' | 'denied' | 'no_worker' | 'error';

/** Demande la permission, abonne l'appareil et l'enregistre au compte. */
export async function enableReminders(publicKey: string): Promise<EnableOutcome> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return 'denied';
    }
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration === undefined) {
      return 'no_worker';
    }
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      }));
    const response = await fetch('/api/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });
    return response.ok ? 'enabled' : 'error';
  } catch {
    return 'error';
  }
}

/** Désabonne l'appareil et l'oublie côté serveur. */
export async function disableReminders(): Promise<boolean> {
  try {
    const subscription = await currentSubscription();
    if (subscription === null) {
      return true;
    }
    await fetch('/api/push', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    return subscription.unsubscribe();
  } catch {
    return false;
  }
}
