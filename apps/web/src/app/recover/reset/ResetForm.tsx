'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { readMessage } from '../../unlock/UnlockForm';

/** Aligné sur MIN_PASSWORD_LENGTH côté serveur, qui reste l'autorité. */
const MIN_PASSWORD_LENGTH = 10;

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (token === '') {
    return (
      <p>
        Ce lien est incomplet.{' '}
        <Link href="/recover" className="underline underline-offset-[3px]">
          En demander un autre
        </Link>
      </p>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/recover/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (response.ok) {
        router.replace('/');
        router.refresh();
        return;
      }
      setError(readMessage(await response.json().catch(() => null)) ?? 'Lien invalide.');
    } catch {
      setError('Connexion impossible.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <div className="grid gap-2">
        <Label htmlFor="new-password">Nouveau mot de passe</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          autoFocus
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className="text-[12.5px] text-muted-foreground">
          {MIN_PASSWORD_LENGTH} caractères minimum.
        </p>
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <Button
        type="submit"
        disabled={pending || password.length < MIN_PASSWORD_LENGTH}
        className="mt-1 w-full"
      >
        {pending ? 'Enregistrement…' : 'Changer le mot de passe'}
      </Button>
    </form>
  );
}
