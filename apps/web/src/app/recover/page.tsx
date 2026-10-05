import { KeyRoundIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { emailRecoveryAvailable } from '@/server/services/account';
import { RecoverForm } from './RecoverForm';

export const metadata: Metadata = { title: 'Aars' };

// La disponibilité du courriel se lit à chaque affichage : elle dépend de
// variables d'environnement, qu'on peut poser sans reconstruire.
export const dynamic = 'force-dynamic';

/** Mot de passe oublié : par le code de secours, ou par courriel si l'envoi existe. */
export default function RecoverPage() {
  return (
    <div className="flex min-h-[92dvh] flex-col justify-center px-1 pt-4 pb-7">
      <span
        aria-hidden
        className="mb-5 flex size-[46px] items-center justify-center rounded-xl bg-muted"
      >
        <KeyRoundIcon className="size-[22px]" />
      </span>
      <h1 className="text-[25px] font-semibold tracking-tight">Mot de passe oublié</h1>
      <p className="mt-1.5 mb-6 text-muted-foreground">
        Avec le code de secours noté depuis les réglages, tu choisis un nouveau mot de passe tout
        de suite.
      </p>
      <RecoverForm emailAvailable={emailRecoveryAvailable()} />
    </div>
  );
}
