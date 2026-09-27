import { KeyRoundIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { ResetForm } from './ResetForm';

export const metadata: Metadata = { title: 'NutriPerso' };

/** Nouveau mot de passe, depuis le lien reçu par courriel. */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const raw = (await searchParams).token;
  const token = typeof raw === 'string' ? raw : '';

  return (
    <div className="flex min-h-[92dvh] flex-col justify-center px-1 pt-4 pb-7">
      <span
        aria-hidden
        className="mb-5 flex size-[46px] items-center justify-center rounded-xl bg-muted"
      >
        <KeyRoundIcon className="size-[22px]" />
      </span>
      <h1 className="text-[25px] font-semibold tracking-tight">Nouveau mot de passe</h1>
      <p className="mt-1.5 mb-6 text-muted-foreground">
        Le lien ne sert qu’une fois. Tu seras connecté dans la foulée.
      </p>
      <ResetForm token={token} />
    </div>
  );
}
