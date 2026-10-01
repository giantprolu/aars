'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  currentSubscription,
  disableReminders,
  enableReminders,
  pushSupport,
  type PushSupport,
} from '@/lib/client/push';
import { readMessage } from '../unlock/UnlockForm';

/**
 * Les réglages du compte qui demandent un geste dans le navigateur.
 *
 * Chacun est un petit composant plutôt qu'un seul écran : ils vivent dans les
 * lignes de la carte « Compte », servie par le serveur, et n'ont en commun que
 * d'avoir besoin de JavaScript.
 */

/**
 * L'interrupteur du rappel de repas, pour cet appareil.
 *
 * Son état est lu dans le navigateur et non en base : les rappels sont par
 * appareil, et le téléphone peut être abonné quand l'ordinateur ne l'est pas.
 */
export function ReminderSwitch({ publicKey }: { publicKey: string | null }) {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setSupport(pushSupport());
    void currentSubscription().then((subscription) => setEnabled(subscription !== null));
  }, []);

  if (publicKey === null) {
    return <span className="text-[12.5px] text-muted-foreground">Non configuré</span>;
  }
  if (support === 'install_required') {
    return (
      <span className="max-w-[12rem] text-right text-[12.5px] text-muted-foreground">
        Installe l’app sur l’écran d’accueil d’abord
      </span>
    );
  }
  if (support === 'unsupported') {
    return <span className="text-[12.5px] text-muted-foreground">Indisponible ici</span>;
  }

  async function toggle(next: boolean) {
    if (publicKey === null) {
      return;
    }
    setBusy(true);
    setMessage(null);
    if (next) {
      const outcome = await enableReminders(publicKey);
      setEnabled(outcome === 'enabled');
      if (outcome === 'denied') {
        setMessage('Notifications refusées dans les réglages du téléphone.');
      } else if (outcome !== 'enabled') {
        setMessage('Activation impossible pour l’instant.');
      }
    } else {
      setEnabled(!(await disableReminders()));
    }
    setBusy(false);
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Switch
        checked={enabled}
        onCheckedChange={(next) => void toggle(next)}
        disabled={busy || support === null}
        aria-label="Rappel du déjeuner à 14 h"
      />
      {message !== null ? (
        <span role="status" className="max-w-[12rem] text-right text-[12px] text-destructive">
          {message}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Tire le code de secours et le montre une fois.
 *
 * La fenêtre ne se ferme que sur « C'est noté » : le code n'existe en clair
 * que dans cette réponse, et le laisser filer d'un toucher à côté obligerait
 * à en tirer un autre.
 */
export function RecoveryCodeButton({ exists }: { exists: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const response = await fetch('/api/account/recovery-code', { method: 'POST' });
      if (response.ok) {
        const body = (await response.json()) as { code: string };
        setCopied(false);
        setCode(body.code);
      }
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (code === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => void generate()} disabled={busy}>
        {busy ? 'Tirage…' : exists ? 'Renouveler' : 'Créer'}
      </Button>
      <Dialog open={code !== null}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Ton code de secours</DialogTitle>
            <DialogDescription>
              Note-le hors du téléphone. Il permet de choisir un nouveau mot de passe si tu
              l’oublies, une seule fois. Il ne sera plus affiché.
            </DialogDescription>
          </DialogHeader>
          <p className="tabular my-3 rounded-lg bg-muted py-3 text-center font-mono text-[19px] tracking-widest select-all">
            {code}
          </p>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => void copy()}>
              {copied ? 'Copié' : 'Copier'}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setCode(null);
                router.refresh();
              }}
            >
              C’est noté
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Supprime le compte, après le mot de passe.
 *
 * Le bouton de confirmation reste désactivé tant que le champ est vide, et la
 * fenêtre rappelle l'export : c'est la dernière occasion de garder ses données.
 */
export function DeleteAccountButton() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(event: React.MouseEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        router.replace('/unlock');
        router.refresh();
        return;
      }
      setError(readMessage(await response.json().catch(() => null)) ?? 'Suppression impossible.');
    } catch {
      setError('Connexion impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) {
          setPassword('');
          setError(null);
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="mt-2.5 w-full text-destructive hover:text-destructive"
        >
          Supprimer mon compte
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer le compte ?</AlertDialogTitle>
          <AlertDialogDescription>
            Journal, pesées, recettes, séances et favoris seront effacés pour de bon. Exporte tes
            données avant si tu veux les garder.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="delete-password">Mot de passe</Label>
          <Input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error !== null ? (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Garder mon compte</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => void remove(event)}
            disabled={busy || password === ''}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {busy ? 'Suppression…' : 'Supprimer'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
