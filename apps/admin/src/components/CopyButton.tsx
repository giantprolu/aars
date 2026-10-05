'use client';

import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** Copie un texte dans le presse-papiers, et le dit deux secondes. */
export function CopyButton({ text, label = 'Copier le prompt', size = 'default' }: { text: string; label?: string; size?: 'default' | 'sm' }) {
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setFailed(false);
      setTimeout(() => setDone(false), 2000);
    } catch {
      setFailed(true);
    }
  }

  return (
    <Button size={size} variant="secondary" onClick={() => void copy()}>
      {done ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
      {done ? 'Copié' : failed ? 'Copie refusée' : label}
    </Button>
  );
}
