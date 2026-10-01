import { LeafIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { UnlockForm } from './UnlockForm';

export const metadata: Metadata = { title: 'NutriPerso' };

/**
 * Écran de connexion (FR-1, UJ-6).
 * Seule surface accessible sans session, avec les ressources statiques.
 */
export default function UnlockPage() {
  return (
    <div className="flex min-h-[92dvh] flex-col justify-center px-1 pt-4 pb-7">
      <span
        aria-hidden
        className="mb-5 flex size-[46px] items-center justify-center rounded-xl bg-muted"
      >
        <LeafIcon className="size-[22px]" />
      </span>
      <h1 className="text-[25px] font-semibold tracking-tight">NutriPerso</h1>
      <p className="mt-1.5 mb-6 text-muted-foreground">
        Chacun son compte, son journal et sa cible. Connecte-toi, ou crée le tien.
      </p>
      <UnlockForm />
    </div>
  );
}
