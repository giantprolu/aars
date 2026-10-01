'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { readMessage } from '../unlock/UnlockForm';

/** Aligné sur MIN_PASSWORD_LENGTH côté serveur, qui reste l'autorité. */
const MIN_PASSWORD_LENGTH = 10;

/**
 * Les deux voies de récupération.
 *
 * Le code de secours d'abord : il marche toujours, sans attendre un courriel.
 * L'onglet du courriel n'apparaît que si l'envoi est configuré — le proposer
 * sans cela ferait attendre un message qui ne partira pas.
 */
export function RecoverForm({ emailAvailable }: { emailAvailable: boolean }) {
  if (!emailAvailable) {
    return <CodeForm />;
  }
  return (
    <Tabs defaultValue="code">
      <TabsList className="mb-4 w-full">
        <TabsTrigger value="code">Code de secours</TabsTrigger>
        <TabsTrigger value="email">Par courriel</TabsTrigger>
      </TabsList>
      <TabsContent value="code">
        <CodeForm />
      </TabsContent>
      <TabsContent value="email">
        <EmailForm />
      </TabsContent>
    </Tabs>
  );
}

function CodeForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/recover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, code, password }),
      });
      if (response.ok) {
        router.replace('/');
        router.refresh();
        return;
      }
      setError(readMessage(await response.json().catch(() => null)) ?? 'Récupération impossible.');
    } catch {
      setError('Connexion impossible.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <div className="grid gap-2">
        <Label htmlFor="recover-email">Adresse</Label>
        <Input
          id="recover-email"
          type="email"
          inputMode="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="recover-code">Code de secours</Label>
        <Input
          id="recover-code"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          required
          placeholder="XXXX-XXXX-XXXX-XXXX"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="tabular tracking-wider uppercase"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="recover-password">Nouveau mot de passe</Label>
        <Input
          id="recover-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className="text-[12.5px] text-muted-foreground">
          {MIN_PASSWORD_LENGTH} caractères minimum. Le code ne sert qu’une fois : pense à en tirer
          un nouveau dans Réglages.
        </p>
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <Button
        type="submit"
        disabled={pending || email === '' || code === '' || password === '' || tooShort}
        className="mt-1 w-full"
      >
        {pending ? 'Vérification…' : 'Changer le mot de passe'}
      </Button>
      <BackToLogin />
    </form>
  );
}

function EmailForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/recover/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (response.ok) {
        setSent(true);
        return;
      }
      setError('La demande n’a pas pu être envoyée.');
    } catch {
      setError('Connexion impossible.');
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-3.5">
        <p role="status">
          Si un compte existe à cette adresse, un courriel vient de partir avec un lien valable
          trente minutes.
        </p>
        <BackToLogin />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <div className="grid gap-2">
        <Label htmlFor="reset-email">Adresse</Label>
        <Input
          id="reset-email"
          type="email"
          inputMode="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending || email === ''} className="mt-1 w-full">
        {pending ? 'Envoi…' : 'Recevoir un lien'}
      </Button>
      <BackToLogin />
    </form>
  );
}

function BackToLogin() {
  return (
    <p className="mt-2 text-center">
      <Link href="/unlock" className="text-muted-foreground underline underline-offset-[3px]">
        Revenir à la connexion
      </Link>
    </p>
  );
}
