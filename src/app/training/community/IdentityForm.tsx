'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveIdentity } from '@/lib/client/social';
import {
  DISPLAY_NAME_MAX,
  HANDLE_MAX,
  HANDLE_MIN,
  isValidHandle,
  normalizeHandle,
} from '@/lib/social';

/**
 * Se présenter : un identifiant unique pour être trouvé, un nom pour être lu.
 *
 * L'identifiant est vérifié à la frappe, sur les mêmes règles que le serveur,
 * pour qu'un refus ne tombe pas après l'envoi. Qu'il soit déjà pris, seul le
 * serveur peut le dire.
 */
export function IdentityForm({
  initialHandle,
  initialDisplayName,
  submitLabel,
}: {
  initialHandle: string | null;
  initialDisplayName: string | null;
  submitLabel: string;
}) {
  const router = useRouter();
  const [handle, setHandle] = useState(initialHandle ?? '');
  const [displayName, setDisplayName] = useState(initialDisplayName ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const normalized = normalizeHandle(handle);
  const valid = isValidHandle(normalized);
  const unchanged =
    normalized === (initialHandle ?? '') && displayName.trim() === (initialDisplayName ?? '');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const outcome = await saveIdentity(normalized, displayName.trim() === '' ? null : displayName);
    setBusy(false);
    if (outcome.kind === 'saved') {
      setMessage('Enregistré.');
      router.refresh();
      return;
    }
    setMessage(
      outcome.kind === 'taken'
        ? `@${normalized} est déjà pris.`
        : 'L’identifiant n’a pas pu être enregistré.',
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
      <div className="grid gap-2">
        <Label htmlFor="identity-handle">Identifiant</Label>
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          >
            @
          </span>
          <Input
            id="identity-handle"
            value={handle.replace(/^@+/, '')}
            onChange={(event) => {
              setHandle(event.target.value);
              setMessage(null);
            }}
            maxLength={HANDLE_MAX}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={handle !== '' && !valid}
            aria-describedby="identity-handle-hint"
            className="pl-7"
            placeholder="camille_s"
          />
        </div>
        <p id="identity-handle-hint" className="text-[12.5px] text-muted-foreground">
          Unique, {HANDLE_MIN} à {HANDLE_MAX} caractères : lettres, chiffres et _. C’est par lui
          qu’on te trouve.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="identity-name">Nom affiché</Label>
        <Input
          id="identity-name"
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.target.value);
            setMessage(null);
          }}
          maxLength={DISPLAY_NAME_MAX}
          placeholder="Camille"
        />
        <p className="text-[12.5px] text-muted-foreground">
          Facultatif, et pas forcément unique. Ton adresse n’est jamais montrée.
        </p>
      </div>

      {message !== null ? (
        <p role="status" className="text-[13px] text-muted-foreground">
          {message}
        </p>
      ) : null}

      <Button type="submit" disabled={busy || !valid || unchanged}>
        {busy ? 'Enregistrement…' : submitLabel}
      </Button>
    </form>
  );
}
