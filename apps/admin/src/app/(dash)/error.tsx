'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/** Le serveur Aars n'a pas répondu, ou a refusé la clé d'administration. */
export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-6">
      <Alert variant="destructive">
        <AlertTitle>Données indisponibles</AlertTitle>
        <AlertDescription>
          Le serveur Aars ne répond pas, ou refuse la clé : vérifie <code>API_URL</code> et que{' '}
          <code>ADMIN_API_KEY</code> est la même ici et sur le projet de l&apos;app.
        </AlertDescription>
      </Alert>
      <Button variant="outline" onClick={reset}>
        Réessayer
      </Button>
    </div>
  );
}
