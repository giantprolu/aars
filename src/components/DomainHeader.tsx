import type { LucideIcon } from 'lucide-react';
import { UserAvatar } from './UserAvatar';
import { cn } from '@/lib/utils';

/**
 * L'en-tête des destinations de la barre (maquette 5a) : la pastille carrée à
 * la couleur du domaine, le titre, une ligne de contexte, et l'avatar qui mène
 * à Moi.
 */

const TONES = {
  cook: 'bg-cook text-cook-on',
  sport: 'bg-sport text-sport-on',
  social: 'bg-social text-social-on',
} as const;

export function DomainHeader({
  title,
  kicker,
  icon: Icon,
  tone,
  initials,
}: {
  title: string;
  kicker?: React.ReactNode;
  icon: LucideIcon;
  tone: keyof typeof TONES;
  initials: string;
}) {
  return (
    <header className="flex items-center justify-between gap-3 px-1 pt-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className={cn('flex size-[34px] flex-none items-center justify-center rounded-[11px]', TONES[tone])}
        >
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl leading-[1.1] font-semibold tracking-[-0.03em]">{title}</h1>
          {kicker ? <div className="truncate text-[12.5px] text-muted-foreground">{kicker}</div> : null}
        </div>
      </div>
      <UserAvatar initials={initials} />
    </header>
  );
}
