'use client';

import { ImagePlusIcon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/** Au plus grand côté : le serveur réduit ensuite à 1200 px, en WebP. */
const MAX_SIDE = 1600;

/**
 * Réduit la photo dans le navigateur avant l'envoi : une photo de téléphone
 * pèse souvent plus que ce qu'une requête accepte (4,5 Mo chez Vercel).
 */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('canvas');
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob'))), 'image/jpeg', 0.88),
  );
}

/** Choisir, envoyer, remplacer ou retirer une photo. */
export function PhotoUploader({
  kind,
  id,
  hasPhoto,
  removable = false,
  size = 'default',
}: {
  kind: 'recipe' | 'catalog';
  id: string;
  hasPhoto: boolean;
  removable?: boolean;
  size?: 'default' | 'sm';
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = `/api/photo?kind=${kind}&id=${encodeURIComponent(id)}`;

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = await shrink(file);
      const response = await fetch(target, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body });
      if (!response.ok) {
        const message = ((await response.json().catch(() => null)) as { error?: string } | null)?.error;
        setError(message ?? 'Envoi refusé.');
        return;
      }
      router.refresh();
    } catch {
      setError('Image illisible.');
    } finally {
      setBusy(false);
      if (input.current) {
        input.current.value = '';
      }
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const response = await fetch(target, { method: 'DELETE' });
    setBusy(false);
    if (!response.ok) {
      setError('Suppression refusée.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void upload(file);
            }
          }}
        />
        <Button size={size} variant={hasPhoto ? 'outline' : 'default'} disabled={busy} onClick={() => input.current?.click()}>
          <ImagePlusIcon aria-hidden />
          {busy ? 'Envoi…' : hasPhoto ? 'Changer' : 'Ajouter une photo'}
        </Button>
        {removable && hasPhoto ? (
          <Button size={size} variant="ghost" disabled={busy} onClick={() => void remove()} aria-label="Retirer la photo">
            <Trash2Icon aria-hidden />
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
