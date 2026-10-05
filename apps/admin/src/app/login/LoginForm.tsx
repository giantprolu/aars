'use client';

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { FingerprintIcon, KeyRoundIcon, LockIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { beginPasskey, completePasskey, submitPassword, type PasswordState } from './actions';

/** Entrée en deux temps : le mot de passe, puis la passkey (ou son enregistrement la première fois). */
export function LoginForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState<PasswordState, FormData>(submitPassword, { step: 'password', error: null });
  const [device, setDevice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function passkey(purpose: 'login' | 'enroll') {
    setBusy(true);
    setError(null);
    try {
      const options = await beginPasskey(purpose);
      if ('error' in options) {
        setError(options.error);
        return;
      }
      const response =
        options.kind === 'login'
          ? await startAuthentication({ optionsJSON: options.options })
          : await startRegistration({ optionsJSON: options.options });
      const failure = await completePasskey(purpose, response, device);
      if (failure !== null) {
        setError(failure);
        return;
      }
      router.replace('/');
      router.refresh();
    } catch {
      setError('Passkey annulée ou refusée par l’appareil.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <LockIcon className="size-5" aria-hidden />
          Aars admin
        </CardTitle>
        <CardDescription>
          {state.step === 'password'
            ? 'Mot de passe, puis passkey.'
            : state.step === 'login'
              ? 'Mot de passe accepté. Valide avec ta passkey.'
              : 'Première connexion : enregistre la passkey de cet appareil.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.step === 'password' ? (
          <form action={action} className="flex flex-col gap-3">
            <div className="grid gap-2">
              <Label htmlFor="password">Mot de passe admin</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
            </div>
            <Button type="submit" disabled={pending}>
              <KeyRoundIcon aria-hidden />
              {pending ? 'Vérification…' : 'Continuer'}
            </Button>
          </form>
        ) : state.step === 'login' ? (
          <Button onClick={() => void passkey('login')} disabled={busy}>
            <FingerprintIcon aria-hidden />
            {busy ? 'En attente de l’appareil…' : 'Valider avec ma passkey'}
          </Button>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid gap-2">
              <Label htmlFor="device">Nom de cet appareil</Label>
              <Input id="device" value={device} onChange={(event) => setDevice(event.target.value)} placeholder="iPhone, MacBook…" maxLength={60} />
            </div>
            <Button onClick={() => void passkey('enroll')} disabled={busy}>
              <FingerprintIcon aria-hidden />
              {busy ? 'En attente de l’appareil…' : 'Enregistrer ma passkey'}
            </Button>
          </div>
        )}
        {state.error || error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error ?? error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
