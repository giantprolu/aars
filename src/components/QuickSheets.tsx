'use client';

import {
  CameraIcon,
  HistoryIcon,
  ListPlusIcon,
  MinusIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  ScanBarcodeIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  StarIcon,
  XIcon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { replayFavorite } from '@/lib/client/favorites';
import { repeatEntry } from '@/lib/client/quick-add';
import { startFreeSession, startSession } from '@/lib/client/training';
import { saveWeighIn } from '@/lib/client/weight';
import { formatRecentDay, hourInParis } from '@/lib/date';
import { MEALS, MEAL_LABELS, MEAL_SHORT_LABELS, type Meal, isMeal, mealForHour } from '@/lib/meal';
import { formatGrams } from '@/lib/nutrition';
import type { QuickAddContext } from '@/lib/quick-add';
import { cn, parseDecimal } from '@/lib/utils';
import { MAX_WEIGHT_KG, MIN_WEIGHT_KG, isValidWeighIn } from '@/lib/weight';

/**
 * Les trois feuilles du bouton + : un repas, une séance, une pesée.
 *
 * Chacune reprend la maquette 6a. Elles partagent la poignée, l'en-tête à
 * croix ronde et la façon de finir : un geste abouti referme tout, affiche un
 * court message en haut de l'écran et rafraîchit la page dessous.
 */

export interface QuickSheetProps {
  context: QuickAddContext | null;
  onClose: () => void;
  /** Le geste a abouti : refermer, dire ce qui a été fait, relire la page. */
  onDone: (message: string) => void;
}

function QuickSheet({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-h-[88dvh] max-w-lg gap-3.5 overflow-y-auto px-4 pt-2.5 pb-[calc(2.5rem+var(--safe-bottom))]"
      >
        <div aria-hidden className="h-1 w-10 self-center rounded-full bg-track" />
        <div className="flex items-center justify-between px-1">
          <SheetTitle className="text-[19px] font-semibold tracking-[-0.02em]">{title}</SheetTitle>
          <SheetClose
            className="flex size-8 items-center justify-center rounded-full bg-muted"
            aria-label="Fermer"
          >
            <XIcon aria-hidden className="size-[15px]" />
          </SheetClose>
        </div>
        <SheetDescription className="sr-only">{description}</SheetDescription>
        {children}
      </SheetContent>
    </Sheet>
  );
}

/** Intitulé de section des feuilles : petites capitales espacées. */
function SheetLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 text-[11.5px] font-bold tracking-[0.06em] text-foreground uppercase">
      {children}
    </p>
  );
}

function Tile({
  href,
  icon: Icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex flex-col items-center gap-1.5 rounded-2xl bg-nutri-soft px-2 py-3 text-nutri-ink transition-opacity active:opacity-70"
    >
      <Icon aria-hidden className="size-[22px]" strokeWidth={1.9} />
      <span className="text-[12.5px] font-semibold">{label}</span>
    </Link>
  );
}

/** « au déjeuner », « au petit-déjeuner » : le repas en complément de lieu. */
function toMeal(meal: Meal): string {
  return `au ${MEAL_LABELS[meal].toLowerCase()}`;
}

export function MealSheet({
  open,
  context,
  onClose,
  onDone,
}: QuickSheetProps & { open: boolean }) {
  const [meal, setMeal] = useState<Meal>(() => mealForHour(hourInParis()));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // L'heure a pu tourner depuis le dernier passage : on repart d'elle à chaque ouverture.
  useEffect(() => {
    if (open) {
      setMeal(mealForHour(hourInParis()));
      setError(null);
    }
  }, [open]);

  async function add(key: string, label: string, run: () => Promise<{ kind: string }>) {
    setBusy(key);
    setError(null);
    const outcome = await run();
    setBusy(null);
    if (outcome.kind === 'ok') {
      onDone(`${label} ajouté ${toMeal(meal)}`);
      return;
    }
    setError('L’ajout n’a pas abouti. Réessaie.');
  }

  const query = `?meal=${meal}`;
  const chips = [
    ...(context?.favorites ?? []).map((favorite) => ({
      key: `f${favorite.id}`,
      label: favorite.name,
      run: () => replayFavorite(favorite.id, meal),
    })),
    ...(context?.recents ?? []).map((recent) => ({
      key: `r${recent.entryId}`,
      label: `${recent.label} ${formatGrams(recent.quantityG)} g`,
      run: () => repeatEntry(recent.entryId, meal),
    })),
  ];

  return (
    <QuickSheet
      open={open}
      onClose={onClose}
      title="Ajouter un repas"
      description="Choisis le repas, puis un aliment récent ou une façon de l’ajouter."
    >
      <Tabs value={meal} onValueChange={(value) => isMeal(value) && setMeal(value)}>
        <TabsList className="h-auto w-full bg-background">
          {MEALS.map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              className="py-1.5 text-[13px] text-muted-foreground data-[state=active]:bg-nutri data-[state=active]:text-nutri-on dark:data-[state=active]:bg-nutri dark:data-[state=active]:text-nutri-on"
            >
              {MEAL_SHORT_LABELS[value]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Link
        href={`/add/search${query}`}
        onClick={onClose}
        className="flex h-[46px] items-center gap-2.5 rounded-lg bg-nutri-soft px-3.5 text-muted-foreground"
      >
        <SearchIcon aria-hidden className="size-[17px] text-nutri-ink" />
        Aliment, recette, favori…
      </Link>

      {chips.length > 0 ? (
        <div className="flex flex-col gap-2">
          <SheetLabel>Récents</SheetLabel>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                disabled={busy !== null}
                onClick={() => void add(chip.key, chip.label, chip.run)}
                className="flex max-w-full items-center gap-1.5 rounded-full bg-nutri-soft px-3 py-[7px] text-[13px] font-medium text-nutri-ink disabled:opacity-60"
              >
                <PlusIcon aria-hidden className="size-3 flex-none" strokeWidth={2.5} />
                <span className="truncate">{busy === chip.key ? 'Ajout…' : chip.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error !== null ? (
        <p role="alert" className="px-1 text-[13px] text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-4 gap-2">
        <Tile href={`/add/scan${query}`} icon={ScanBarcodeIcon} label="Scanner" onNavigate={onClose} />
        <Tile href={`/add/favorites${query}`} icon={StarIcon} label="Favoris" onNavigate={onClose} />
        <Tile href={`/add/photo${query}`} icon={CameraIcon} label="Photo" onNavigate={onClose} />
        <Tile href={`/add/manual${query}`} icon={PencilIcon} label="À la main" onNavigate={onClose} />
      </div>
    </QuickSheet>
  );
}

function SessionTile({
  icon: Icon,
  label,
  href,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const className =
    'flex flex-col gap-1.5 rounded-2xl bg-sport-soft p-3 text-left text-sport-ink transition-opacity active:opacity-70 disabled:opacity-50';
  const content = (
    <>
      <Icon aria-hidden className="size-5" strokeWidth={1.9} />
      <span className="text-[12.5px] font-semibold">{label}</span>
    </>
  );
  return href === undefined ? (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {content}
    </button>
  ) : (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

export function SessionSheet({
  open,
  context,
  onClose,
}: QuickSheetProps & { open: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = context?.session ?? null;

  useEffect(() => {
    if (open) {
      setError(null);
    }
  }, [open]);

  async function begin(templateId: number | null) {
    setBusy(true);
    setError(null);
    const outcome = templateId === null ? await startFreeSession() : await startSession(templateId);
    setBusy(false);
    if (outcome.kind === 'started') {
      onClose();
      router.push(`/training/session/${outcome.id}`);
      return;
    }
    setError('La séance n’a pas pu être ouverte.');
  }

  const leadClass =
    'flex w-full items-center gap-3.5 rounded-xl bg-sport px-4 py-3.5 text-left text-sport-on disabled:opacity-60';
  const leadIcon = (
    <span className="flex size-10 flex-none items-center justify-center rounded-full bg-white text-sport">
      <PlayIcon aria-hidden className="size-4 fill-current" />
    </span>
  );

  let lead: React.ReactNode;
  if (session?.kind === 'open') {
    lead = (
      <Link href={`/training/session/${session.sessionId}`} onClick={onClose} className={leadClass}>
        {leadIcon}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">Reprendre {session.name}</span>
          <span className="block text-[12.5px] opacity-80">
            En cours · {session.setCount} série{session.setCount > 1 ? 's' : ''} notée
            {session.setCount > 1 ? 's' : ''}
          </span>
        </span>
      </Link>
    );
  } else if (session?.kind === 'next') {
    lead = (
      <button
        type="button"
        disabled={busy}
        onClick={() => void begin(session.templateId)}
        className={leadClass}
      >
        {leadIcon}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">
            Commencer {session.name}
          </span>
          <span className="block text-[12.5px] opacity-80">
            Prévue aujourd’hui · {session.exerciseCount} exercice
            {session.exerciseCount > 1 ? 's' : ''}
          </span>
        </span>
      </button>
    );
  } else {
    lead = (
      <Link href="/training/preferences" onClick={onClose} className={leadClass}>
        <span className="flex size-10 flex-none items-center justify-center rounded-full bg-white text-sport">
          <SlidersHorizontalIcon aria-hidden className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">Composer mon programme</span>
          <span className="block text-[12.5px] opacity-80">Quatre réponses, et les séances se composent</span>
        </span>
      </Link>
    );
  }

  return (
    <QuickSheet
      open={open}
      onClose={onClose}
      title="Une séance"
      description="Commencer la séance prévue, une séance libre, ou noter une séance déjà faite."
    >
      {lead}
      <div className="grid grid-cols-3 gap-2">
        <SessionTile
          icon={ZapIcon}
          label="Libre"
          disabled={busy || session?.kind === 'open'}
          onClick={() => void begin(null)}
        />
        <SessionTile icon={HistoryIcon} label="Déjà faite" href="/training/import" />
        <SessionTile icon={ListPlusIcon} label="Composer" href="/training/compose" />
      </div>
      {error !== null ? (
        <p role="alert" className="px-1 text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </QuickSheet>
  );
}

/** « 78,4 », à une décimale, comme la balance l'affiche. */
function formatKg(value: number): string {
  return value.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Poids proposé à qui ne s'est jamais pesé : un point de départ à ajuster, pas une norme. */
const FIRST_WEIGH_IN_KG = 70;

export function WeighInSheet({
  open,
  context,
  onClose,
  onDone,
}: QuickSheetProps & { open: boolean }) {
  const last = context?.lastWeighIn ?? null;
  const [raw, setRaw] = useState(formatKg(FIRST_WEIGH_IN_KG));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chaque ouverture repart de la dernière pesée : on ajuste de quelques
  // dixièmes plutôt que de tout retaper.
  useEffect(() => {
    if (open) {
      setRaw(formatKg(last?.weightKg ?? FIRST_WEIGH_IN_KG));
      setError(null);
    }
  }, [open, last?.weightKg]);

  const value = parseDecimal(raw);
  const valid = isValidWeighIn(value);

  function step(delta: number) {
    const base = valid ? value : (last?.weightKg ?? FIRST_WEIGH_IN_KG);
    const next = Math.round((base + delta) * 10) / 10;
    setRaw(formatKg(Math.min(MAX_WEIGHT_KG, Math.max(MIN_WEIGHT_KG, next))));
  }

  async function save() {
    if (!valid) {
      setError(`Un poids entre ${MIN_WEIGHT_KG} et ${MAX_WEIGHT_KG} kg.`);
      return;
    }
    setSaving(true);
    setError(null);
    const outcome = await saveWeighIn(value);
    setSaving(false);
    if (outcome.kind === 'ok') {
      onDone(`Pesée enregistrée · ${formatKg(Math.round(value * 10) / 10)} kg`);
      return;
    }
    setError('La pesée n’a pas été enregistrée. Réessaie.');
  }

  const stepClass =
    'flex size-[52px] flex-none items-center justify-center rounded-full bg-body-soft text-body-ink active:opacity-70';

  return (
    <QuickSheet
      open={open}
      onClose={onClose}
      title="Pesée"
      description="Le poids de ce matin, au dixième de kilo."
    >
      <div className="flex items-center justify-center gap-[22px]">
        <button type="button" onClick={() => step(-0.1)} aria-label="Moins 100 g" className={stepClass}>
          <MinusIcon aria-hidden className="size-5" />
        </button>
        <label className="min-w-[150px] text-center">
          <span className="sr-only">Poids en kilos</span>
          <input
            inputMode="decimal"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            className="w-[150px] bg-transparent text-center text-[52px] leading-none font-bold tracking-[-0.04em] text-body-ink outline-none"
          />
          <span className="block text-[13px] text-muted-foreground">kg · ce matin</span>
        </label>
        <button type="button" onClick={() => step(0.1)} aria-label="Plus 100 g" className={stepClass}>
          <PlusIcon aria-hidden className="size-5" />
        </button>
      </div>
      <p className="text-center text-[13px] text-muted-foreground">
        {last === null
          ? 'Première pesée : elle mettra ta cible à jour.'
          : `Dernière : ${formatKg(last.weightKg)} kg, ${formatRecentDay(last.day)}`}
      </p>
      {error !== null ? (
        <p role="alert" className="text-center text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className={cn(
          'flex h-[52px] items-center justify-center rounded-full bg-body text-[15.5px] font-bold text-body-on disabled:opacity-60',
        )}
      >
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </QuickSheet>
  );
}
