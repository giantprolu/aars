'use client';

import { startRegistration } from '@simplewebauthn/browser';
import { FingerprintIcon, LogOutIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { beginAddPasskey, completeAddPasskey, revoke, signOut } from './actions';

export function AddPasskey() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function add() {
    setBusy(true);
    setMessage(null);
    try {
      const options = await beginAddPasskey();
      if (options === null || options.kind !== 'register') {
        setMessage({ ok: false, text: 'Session expirée : reconnecte-toi.' });
        return;
      }
      const failure = await completeAddPasskey(await startRegistration({ optionsJSON: options.options }), name);
      setMessage(failure === null ? { ok: true, text: 'Passkey ajoutée.' } : { ok: false, text: failure });
      if (failure === null) {
        setName('');
      }
    } catch {
      setMessage({ ok: false, text: 'Passkey annulée ou refusée par l’appareil.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-2">
          <Label htmlFor="device">Nom de l&apos;appareil</Label>
          <Input id="device" value={name} onChange={(event) => setName(event.target.value)} placeholder="iPad, clé USB…" maxLength={60} />
        </div>
        <Button onClick={() => void add()} disabled={busy}>
          <FingerprintIcon aria-hidden />
          {busy ? 'En attente de l’appareil…' : 'Ajouter une passkey'}
        </Button>
      </div>
      {message ? (
        <Alert variant={message.ok ? 'default' : 'destructive'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

export function RevokeButton({ id, name, last }: { id: string; name: string; last: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={busy || last}
        title={last ? 'La dernière passkey ne se révoque pas.' : undefined}
        onClick={async () => {
          if (!window.confirm(`Révoquer la passkey « ${name} » ?`)) {
            return;
          }
          setBusy(true);
          setError(await revoke(id));
          setBusy(false);
        }}
      >
        <Trash2Icon aria-hidden />
        Révoquer
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="outline">
        <LogOutIcon aria-hidden />
        Se déconnecter
      </Button>
    </form>
  );
}
