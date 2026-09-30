import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Les trois faces de la Cuisine : le plan, les recettes, les courses.
 *
 * Trois adresses et non trois états d'un même écran : chaque onglet est un
 * lien, qui s'ouvre dans un nouvel onglet et survit à un rechargement. La
 * semaine voyage avec le plan et les courses.
 *
 * La pastille des courses compte ce qui reste à acheter.
 */
export function KitchenTabs({
  current,
  weekStart,
  shoppingLeft = null,
}: {
  current: 'week' | 'recipes' | 'shopping';
  weekStart?: string;
  shoppingLeft?: number | null;
}) {
  const query = weekStart === undefined ? '' : `?from=${weekStart}`;
  const tabs = [
    { key: 'week', label: 'Plan', href: `/kitchen${query}` },
    { key: 'recipes', label: 'Recettes', href: '/kitchen/recipes' },
    { key: 'shopping', label: 'Courses', href: `/kitchen/shopping${query}` },
  ] as const;

  return (
    <nav aria-label="Cuisine" className="flex rounded-full bg-cook-soft p-[3px] text-[13.5px] font-semibold">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={current === tab.key ? 'page' : undefined}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-full py-[7px] text-cook-ink',
            current === tab.key && 'bg-card',
          )}
        >
          {tab.label}
          {tab.key === 'shopping' && shoppingLeft !== null && shoppingLeft > 0 ? (
            <span className="rounded-full bg-cook px-1.5 text-[11px] text-cook-on">{shoppingLeft}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
