import { CheckIcon, ChevronRightIcon, UserPlusIcon } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * L'arrivée sur Aujourd'hui après le premier lancement (maquette 5b, écran 4) :
 * ce qui a été réglé, l'invitation à suivre des amis, et une bulle au-dessus
 * du bouton + qui dit par où commencer.
 */
export function WelcomeCard({
  name,
  targetKcal,
  handle,
  sessionsPerWeek,
}: {
  name: string | null;
  targetKcal: string | null;
  handle: string | null;
  sessionsPerWeek: number | null;
}) {
  const items = [
    { done: targetKcal !== null, text: targetKcal === null ? 'Cible : à fixer' : `Cible : ${targetKcal} kcal par jour`, dot: 'bg-nutri text-nutri-on' },
    { done: handle !== null, text: handle === null ? 'Profil : plus tard' : `Profil : @${handle}`, dot: 'bg-social text-social-on' },
    {
      done: sessionsPerWeek !== null,
      text: sessionsPerWeek === null ? 'Programme : à composer' : `Programme : ${sessionsPerWeek} séances par semaine`,
      dot: 'bg-sport text-sport-on',
    },
  ];
  const done = items.filter((item) => item.done).length;

  return (
    <>
      <section className="flex flex-col gap-3 rounded-[20px] border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-semibold">C’est prêt{name === null ? '' : `, ${name}`}</p>
          <span className="text-xs text-muted-foreground">
            {done} sur {items.length}
          </span>
        </div>
        <ul className="flex flex-col gap-2 text-[13.5px]">
          {items.map((item) => (
            <li key={item.text} className={cn('flex items-center gap-2.5', !item.done && 'text-muted-foreground')}>
              <span
                aria-hidden
                className={cn(
                  'flex size-5 flex-none items-center justify-center rounded-full',
                  item.done ? item.dot : 'bg-muted',
                )}
              >
                {item.done ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
              </span>
              {item.text}
            </li>
          ))}
        </ul>
      </section>

      <Link href="/training/community/people" className="flex items-center gap-3 rounded-xl bg-social-soft p-3.5">
        <UserPlusIcon aria-hidden className="size-[18px] text-social-ink" />
        <span className="flex-1">
          <span className="block text-sm font-medium">Suivre des amis</span>
          <span className="block text-[12.5px] text-muted-foreground">Cherche-les par identifiant</span>
        </span>
        <ChevronRightIcon aria-hidden className="size-4 text-faint" />
      </Link>

      <div
        data-welcome-hint
        role="note"
        className="pointer-events-none fixed bottom-[calc(98px+var(--safe-bottom))] left-1/2 z-30 -translate-x-1/2 rounded-[12px] bg-nutri px-3 py-2 text-[13px] font-medium text-nutri-on"
      >
        Touche + puis Repas
      </div>
    </>
  );
}
