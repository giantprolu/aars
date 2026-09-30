'use client';

import { PlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { WeighInSheet } from '@/components/QuickSheets';
import type { WeighIn } from '@/lib/weight';

/**
 * Le bouton « Pesée » de la carte Poids : la même feuille que celle du bouton
 * +, ouverte sur place.
 */
export function WeighInButton({ last }: { last: WeighIn | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 flex-none items-center gap-1.5 rounded-full bg-body px-3 text-[12.5px] font-bold text-body-on"
      >
        <PlusIcon aria-hidden className="size-3" strokeWidth={2.5} />
        Pesée
      </button>
      <WeighInSheet
        open={open}
        context={{ favorites: [], recents: [], session: null, lastWeighIn: last }}
        onClose={() => setOpen(false)}
        onDone={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
