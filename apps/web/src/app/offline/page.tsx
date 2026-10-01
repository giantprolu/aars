import { WifiOffIcon } from 'lucide-react';

/**
 * Écran de repli hors ligne (FR-23, AD-5).
 * Il n'affiche aucune donnée de journal : Postgres est la seule source de
 * vérité, et un cache local présenté comme à jour serait un mensonge.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-muted">
        <WifiOffIcon aria-hidden className="size-5" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Hors ligne</h1>
      <p className="mt-2 max-w-[30ch] text-muted-foreground">
        Le journal vient du serveur. Reconnecte-toi pour le consulter.
      </p>
    </div>
  );
}
