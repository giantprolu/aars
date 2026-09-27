'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Connexion et inscription sur le même écran (FR-1).
 *
 * Un seul formulaire à deux modes plutôt que deux pages : les champs sont les
 * mêmes, et l'inscription étant libre, la bascule doit coûter un geste.
 *
 * Le message d'échec de connexion ne distingue jamais l'adresse inconnue du
 * mot de passe faux (UX-DR-5). L'inscription, elle, doit dire que l'adresse
 * est prise, sans quoi on ne peut pas corriger sa saisie.
 */

/** Aligné sur MIN_PASSWORD_LENGTH côté serveur, qui reste l'autorité. */
const MIN_PASSWORD_LENGTH = 10;

type Mode = 'login' | 'register';

export function UnlockForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch(mode === 'login' ? '/api/session' : '/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        router.replace('/');
        router.refresh();
        return;
      }

      const body: unknown = await response.json().catch(() => null);
      setError(readMessage(body) ?? "L'application n'est pas configurée.");
    } catch {
      setError('Connexion impossible.');
    } finally {
      setPending(false);
    }
  }

  const isRegister = mode === 'register';
  const tooShort = isRegister && password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const remaining = MIN_PASSWORD_LENGTH - password.length;

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <div className="grid gap-2">
        <Label htmlFor="email">Adresse</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoFocus
          required
          placeholder="toi@exemple.fr"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          required
          minLength={isRegister ? MIN_PASSWORD_LENGTH : undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? 'password-error' : undefined}
        />
        {isRegister ? (
          <p className="text-[12.5px] text-muted-foreground">
            {tooShort
              ? `Encore ${remaining} caractère${remaining > 1 ? 's' : ''}.`
              : `${MIN_PASSWORD_LENGTH} caractères minimum. Une fois connecté, tire un code de secours dans Réglages : il permet de le changer si tu l'oublies.`}
          </p>
        ) : null}
        {error ? (
          <p id="password-error" role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <Button
        type="submit"
        disabled={pending || email.length === 0 || password.length === 0 || tooShort}
        className="mt-1 w-full"
      >
        {pending ? 'Vérification…' : isRegister ? 'Créer le compte' : 'Se connecter'}
      </Button>

      {isRegister ? null : (
        <p className="text-center">
          <Link
            href="/recover"
            className="text-[13px] text-muted-foreground underline underline-offset-[3px]"
          >
            Mot de passe oublié ?
          </Link>
        </p>
      )}

      <p className="mt-2 text-center text-muted-foreground">
        {isRegister ? 'Déjà un compte ?' : 'Pas encore de compte ?'}{' '}
        <Button
          type="button"
          variant="link"
          onClick={() => switchMode(isRegister ? 'login' : 'register')}
          className="h-auto p-0 text-foreground underline underline-offset-[3px]"
        >
          {isRegister ? 'Se connecter' : 'En créer un'}
        </Button>
      </p>
    </form>
  );
}

/** Le message du serveur quand il y en a un : lui seul sait pourquoi il refuse. */
export function readMessage(body: unknown): string | null {
  if (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as { error: unknown }).error === 'object' &&
    (body as { error: unknown }).error !== null
  ) {
    const { message } = (body as { error: { message?: unknown } }).error;
    return typeof message === 'string' ? message : null;
  }
  return null;
}
