'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** Verrouillage de session : supprime le cookie et renvoie au déverrouillage (FR-3). */
export function LockButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function lock() {
    setPending(true);
    try {
      await fetch('/api/session', { method: 'DELETE' });
      router.replace('/unlock');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={lock}
      disabled={pending}
      className="mt-2.5 w-full text-destructive hover:text-destructive"
    >
      {pending ? 'Verrouillage…' : 'Verrouiller'}
    </Button>
  );
}
