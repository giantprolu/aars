import { UtensilsIcon } from 'lucide-react';
import { DomainHeader } from '@/components/DomainHeader';
import { requireUserId } from '@/server/guard';
import { basketFor } from '@/server/services/basket';
import { planForWeek, weekDays } from '@/server/services/meal-plan';
import { targetFor } from '@/server/services/profile';
import { recipesFor } from '@/server/services/recipes';
import { listForWeek } from '@/server/services/shopping';
import { identityFor } from '@/server/services/social';
import { formatShortWeekRange, isJournalDate, startOfWeek, todayInParis } from '@/lib/date';
import { initialsOf } from '@/lib/social';
import { KitchenTabs } from './KitchenTabs';
import { WeekBasket } from './WeekBasket';
import { WeekPlanner } from './WeekPlanner';

// Le plan vient du serveur à chaque navigation : rien n'est mis en cache (AD-5).
export const dynamic = 'force-dynamic';

/** Deux repas par jour, sept jours : ce que le plan peut porter. */
const SLOTS_PER_WEEK = 14;

function Stat({
  label,
  value,
  of,
  ratio,
}: {
  label: string;
  value: number;
  of?: number;
  ratio?: number;
}) {
  return (
    <div className="rounded-2xl border bg-card px-3 py-2.5">
      <p className="text-[11.5px] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">
        {value}
        {of === undefined ? null : (
          <span className="text-xs font-medium text-muted-foreground"> / {of}</span>
        )}
      </p>
      {ratio === undefined ? null : (
        <div className="mt-1 h-1 rounded-full bg-cook-soft">
          <div className="h-full rounded-full bg-cook" style={{ width: `${Math.min(1, ratio) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

/**
 * La Cuisine, face Plan (maquette 5a, écran 3).
 *
 * Elle s'ouvre sur la semaine, et non sur les recettes : on vient ici savoir
 * ce qu'on mange ce soir. Trois chiffres d'abord — les plats choisis, les
 * repas placés, les courses faites — puis ce qu'il reste à cuisiner, puis la
 * grille midi et soir.
 *
 * Composant serveur, aucun import client (AD-10).
 */
export default async function KitchenPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const userId = await requireUserId();
  const today = todayInParis();

  // Une date hors format retombe sur la semaine courante plutôt que de faire
  // échouer l'écran : le paramètre vient d'une URL, que n'importe qui édite.
  const requested = (await searchParams).from;
  const startDate = startOfWeek(
    requested !== undefined && isJournalDate(requested) ? requested : today,
  );

  const [planned, recipes, basket, target, shopping, identity] = await Promise.all([
    planForWeek(userId, startDate),
    recipesFor(userId),
    basketFor(userId, startDate),
    targetFor(userId),
    listForWeek(userId, startDate),
    identityFor(userId),
  ]);

  const basketRecipeIds = new Set(basket.map((item) => item.recipeId));
  const items = shopping?.items ?? [];
  const bought = items.filter((item) => item.checkedAt !== null).length;
  const placed = planned.length;

  return (
    <div className="flex flex-col gap-3 pb-4">
      <DomainHeader
        title="Cuisine"
        kicker={formatShortWeekRange(startDate)}
        icon={UtensilsIcon}
        tone="cook"
        initials={initialsOf(identity.displayName ?? identity.handle)}
      />

      <KitchenTabs
        current="week"
        weekStart={startDate}
        shoppingLeft={shopping === null ? null : items.length - bought}
      />

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Plats choisis" value={basket.length} />
        <Stat label="Repas placés" value={placed} of={SLOTS_PER_WEEK} ratio={placed / SLOTS_PER_WEEK} />
        {shopping === null ? (
          <Stat label="Courses" value={0} of={0} ratio={0} />
        ) : (
          <Stat
            label="Courses"
            value={bought}
            of={items.length}
            ratio={items.length === 0 ? 0 : bought / items.length}
          />
        )}
      </div>

      <WeekBasket weekStart={startDate} basket={basket} />

      <WeekPlanner
        startDate={startDate}
        days={weekDays(startDate)}
        planned={planned}
        recipes={recipes}
        basketRecipeIds={basketRecipeIds}
        today={today}
        targetKcal={target?.targetKcal ?? null}
      />
    </div>
  );
}
