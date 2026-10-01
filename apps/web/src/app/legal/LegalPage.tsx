import type { ReactNode } from 'react';

/**
 * Gabarit des pages publiques que la fiche Google Play lie : sans session,
 * sans barre d'onglets, lisibles depuis un navigateur quelconque.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-[68ch] px-1 pt-6 pb-12 text-[15px] leading-relaxed">
      <h1 className="text-[25px] font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-[12.5px] text-muted-foreground">Mise à jour le {updated}</p>
      <div className="mt-6 flex flex-col gap-4 [&_h2]:mt-4 [&_h2]:text-[17px] [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_a]:underline">
        {children}
      </div>
    </article>
  );
}

/** Le contact, ou à défaut le chemin qui ne demande personne. */
export function Contact({ email }: { email: string | undefined }) {
  return email === undefined ? (
    <>depuis l&apos;application, rubrique Compte et données</>
  ) : (
    <a href={`mailto:${email}`}>{email}</a>
  );
}
