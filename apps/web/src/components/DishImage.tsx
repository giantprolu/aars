import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * La photo d'un plat, ou le motif hachuré quand il n'en a pas.
 *
 * `unoptimized` est délibéré : la photo est déjà redimensionnée en WebP à
 * l'envoi (`npm run upload:photos`), et passer par l'optimiseur de Vercel
 * ferait payer, au-delà du quota gratuit, un travail déjà fait.
 *
 * Le cadre est donné par `className` (hauteur, arrondi) ; l'image le remplit.
 */
export function DishImage({
  src,
  alt,
  className,
  sizes,
}: {
  src: string | null;
  alt: string;
  className?: string;
  sizes: string;
}) {
  if (src === null) {
    return <span aria-hidden className={cn('hatch block', className)} />;
  }
  // Le motif reste dessous : il tient lieu de photo pendant le chargement, et
  // si l'image ne vient pas.
  return (
    <span className={cn('hatch relative block overflow-hidden', className)}>
      <Image src={src} alt={alt} fill unoptimized sizes={sizes} className="object-cover" />
    </span>
  );
}
