import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * La pastille violette en haut à droite des écrans principaux (maquette 5a).
 * Elle porte les initiales et mène à Moi : le corps, la progression, les
 * réglages. Le violet est celui du domaine Corps.
 */
export function UserAvatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <Link
      href="/me"
      aria-label="Moi : poids, progression et réglages"
      className={cn(
        'flex size-9 flex-none items-center justify-center rounded-full bg-body-soft text-[12.5px] font-semibold text-body-ink',
        className,
      )}
    >
      {initials}
    </Link>
  );
}
