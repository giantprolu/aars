'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BottomBar } from '@/components/BottomBar';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatKcal } from '@/lib/nutrition';
import { parseDecimal } from '@/lib/utils';

/**
 * Questionnaire corporel (FR-26).
 *
 * Les mesures d'abord, la cible ensuite, et le bouton qui la recalcule dans la
 * barre basse : l'écran se lit dans l'ordre où il se remplit.
 *
 * Les étapes intermédiaires restent affichées. Montrer le métabolisme de base
 * et la dépense à côté de la cible n'est pas de la décoration : un chiffre
 * unique et sans provenance ne se conteste pas, or ces équations sont des
 * estimations de population qu'il faut corriger à l'usage.
 */

interface Target {
  bmrKcal: number;
  maintenanceKcal: number;
  adjustmentKcal: number;
  targetKcal: number;
  floored: boolean;
  equation: string;
  basis?: string;
  activityCapped?: boolean;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface ProfileFormValues {
  sex: 'male' | 'female';
  birthDate: string;
  heightCm: number;
  weightKg: number;
  bodyFatPercent: number | null;
  activity: string;
  goal: 'lose' | 'maintain' | 'gain';
  ratePercentPerWeek: number;
  /** Cible fixée à la main, ou `null` quand le calcul décide. */
  manualTargetKcal: number | null;
}

const ACTIVITY_LABELS: Record<string, string> = {
  sedentary: 'Sédentaire, pas de sport',
  light: 'Léger, 1 à 3 séances',
  moderate: 'Modéré, 3 à 5 séances',
  active: 'Actif, 6 à 7 séances',
  veryActive: 'Très actif, métier physique',
};

/** Plafond d'une cible saisie à la main, aligné sur `MANUAL_TARGET_MAX_KCAL`. */
const MANUAL_TARGET_MAX = 6000;

/** Chiffre proposé quand l'utilisateur bascule en manuel sans cible calculée. */
const MANUAL_TARGET_SUGGESTION = 2000;

const GOALS = [
  { value: 'lose', label: 'Perdre' },
  { value: 'maintain', label: 'Maintenir' },
  { value: 'gain', label: 'Prendre' },
] as const;

function isGoal(value: string): value is ProfileFormValues['goal'] {
  return value === 'lose' || value === 'maintain' || value === 'gain';
}

function formatDecimal(value: number): string {
  return Number.isNaN(value) ? '' : String(value).replace('.', ',');
}

/**
 * Un champ numérique, son intitulé porte l'unité.
 *
 * Il garde la saisie telle qu'elle est tapée et ne remonte que le nombre lu :
 * repasser par `String(Number(…))` à chaque frappe effaçait la virgule de
 * « 0, » avant qu'on ait pu taper la décimale. Champ vide : `NaN`.
 */
function NumberField({
  id,
  label,
  value,
  onChange,
  hint,
  ...rest
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: React.ReactNode;
  required?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(() => formatDecimal(value));

  // Une valeur changée d'ailleurs (le rythme ramené sous le plafond d'un
  // nouvel objectif) remplace la saisie ; celle qui vient de la saisie, non.
  if (!Object.is(parseDecimal(draft), value)) {
    setDraft(formatDecimal(value));
  }

  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(parseDecimal(event.target.value));
        }}
        className="tabular"
        {...rest}
      />
      {hint ? <p className="text-[12.5px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function TargetCard({ target }: { target: Target }) {
  const sign = target.adjustmentKcal > 0 ? '+' : target.adjustmentKcal < 0 ? '−' : '';

  return (
    <Card className="mt-4 bg-muted">
      <CardContent>
        <p className="text-[12.5px] text-muted-foreground">Ta cible quotidienne</p>
        <p className="tabular mt-0.5 text-[32px] font-semibold tracking-tight">
          {formatKcal(target.targetKcal)} kcal
        </p>
        <p className="tabular mt-0.5 text-[12.5px] text-muted-foreground">
          {target.proteinG} g P · {target.carbsG} g G · {target.fatG} g L
        </p>

        <Separator className="my-3.5" />

        <dl className="tabular flex flex-col gap-2 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Métabolisme de base</dt>
            <dd>{formatKcal(target.bmrKcal)} kcal</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">
              {target.basis === 'measured' ? 'Dépense mesurée, 14 j' : "Dépense avec l'activité"}
            </dt>
            <dd>{formatKcal(target.maintenanceKcal)} kcal</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">
              {target.basis === 'manual' ? 'Écart obtenu' : "Écart pour l'objectif"}
            </dt>
            <dd>
              {sign} {formatKcal(Math.abs(target.adjustmentKcal))} kcal
            </dd>
          </div>
        </dl>

        <p className="mt-3.5 text-[12.5px] text-muted-foreground">
          {target.basis === 'manual' ? (
            <>
              Cible fixée par toi. Le calcul reste affiché pour situer l&apos;écart que tu te
              donnes ; il ne décide plus de rien.
            </>
          ) : (
            <>
              Calcul par{' '}
              {target.equation === 'katch-mcardle'
                ? 'Katch-McArdle, sur ta masse maigre'
                : 'Mifflin-St Jeor'}
              . Une estimation de population, pas une mesure : corrige-la après trois semaines
              selon ton poids réel.
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

export function ProfileForm({
  initial,
  initialTarget,
}: {
  initial: ProfileFormValues | null;
  initialTarget: Target | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProfileFormValues>(
    initial ?? {
      sex: 'male',
      birthDate: '',
      heightCm: 175,
      weightKg: 70,
      bodyFatPercent: null,
      activity: 'moderate',
      goal: 'maintain',
      ratePercentPerWeek: 0,
      manualTargetKcal: null,
    },
  );
  const [target, setTarget] = useState<Target | null>(initialTarget);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function set<K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  // Le rythme n'a de sens qu'avec un objectif de variation, et son plafond
  // dépend du sens : perdre vite abîme la masse maigre, grossir vite ne fait
  // que du gras.
  const maxRate = values.goal === 'lose' ? 1 : 0.5;
  const rateDisabled = values.goal === 'maintain';
  const weeklyKg = Math.round(values.weightKg * values.ratePercentPerWeek * 10) / 1000;

  // Le plancher de la cible manuelle est le minimum clinique du sexe déclaré,
  // repris de `@/lib/energy` : choisir son chiffre n'autorise pas à descendre
  // sous l'apport qui couvre les micronutriments.
  const manualEnabled = values.manualTargetKcal !== null;
  const manualFloor = values.sex === 'male' ? 1500 : 1200;

  function changeGoal(goal: ProfileFormValues['goal']) {
    set('goal', goal);
    // Le rythme précédent peut dépasser le plafond du nouvel objectif.
    const cap = goal === 'lose' ? 1 : 0.5;
    set(
      'ratePercentPerWeek',
      goal === 'maintain' ? 0 : Math.min(values.ratePercentPerWeek || 0.5, cap),
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...values,
          ratePercentPerWeek: rateDisabled ? 0 : values.ratePercentPerWeek,
        }),
      });

      if (!response.ok) {
        setError('Mesures hors des bornes admises.');
        return;
      }

      const body = (await response.json()) as { target: Target };
      setTarget(body.target);
      router.refresh();
    } catch {
      setError('Enregistrement impossible.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="flex flex-col gap-3.5">
        <div className="grid gap-2">
          <Label id="sex-label">Sexe</Label>
          <Tabs
            value={values.sex}
            onValueChange={(value) => (value === 'male' || value === 'female') && set('sex', value)}
          >
            <TabsList aria-labelledby="sex-label" className="w-full">
              <TabsTrigger value="male">Homme</TabsTrigger>
              <TabsTrigger value="female">Femme</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <NumberField
            id="heightCm"
            label="Taille (cm)"
            required
            value={values.heightCm}
            onChange={(value) => set('heightCm', value)}
          />
          <NumberField
            id="weightKg"
            label="Poids (kg)"
            required
            value={values.weightKg}
            onChange={(value) => set('weightKg', value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="birthDate">Date de naissance</Label>
          <Input
            id="birthDate"
            type="date"
            required
            value={values.birthDate}
            onChange={(event) => set('birthDate', event.target.value)}
            className="tabular"
          />
        </div>

        <NumberField
          id="bodyFat"
          label="Masse grasse, si connue (%)"
          placeholder="Laisser vide"
          value={values.bodyFatPercent ?? Number.NaN}
          onChange={(value) => set('bodyFatPercent', Number.isNaN(value) ? null : value)}
          hint="Renseignée, elle fait passer le calcul sur la masse maigre, plus fidèle si tu es très musclé ou très gras."
        />

        <div className="grid gap-2">
          <Label htmlFor="activity">Activité</Label>
          <Select value={values.activity} onValueChange={(value) => set('activity', value)}>
            <SelectTrigger id="activity" className="w-full data-[size=default]:h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ACTIVITY_LABELS).map(([key, text]) => (
                <SelectItem key={key} value={key}>
                  {text}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label id="goal-label">Objectif</Label>
          <Tabs value={values.goal} onValueChange={(value) => isGoal(value) && changeGoal(value)}>
            <TabsList aria-labelledby="goal-label" className="w-full">
              {GOALS.map((goal) => (
                <TabsTrigger key={goal.value} value={goal.value}>
                  {goal.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {rateDisabled ? null : (
          <NumberField
            id="rate"
            label="Rythme visé, par semaine (%)"
            required
            value={values.ratePercentPerWeek}
            onChange={(value) => set('ratePercentPerWeek', value)}
            hint={
              <>
                {Number.isFinite(weeklyKg) ? (
                  <>Soit {formatDecimal(weeklyKg)} kg par semaine. </>
                ) : null}
                Plafond de {formatDecimal(maxRate)} % :{' '}
                {values.goal === 'lose'
                  ? 'au-delà, la masse maigre part avec la graisse.'
                  : 'au-delà, le surplus se stocke sans servir.'}
              </>
            }
          />
        )}

        <Card>
          <CardContent>
            <div className="flex items-center gap-3.5">
              <div className="min-w-0 flex-1">
                <Label htmlFor="manual-toggle" className="text-[14.5px]">
                  Fixer la cible moi-même
                </Label>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  {manualEnabled
                    ? 'Ce chiffre remplace le calcul, mesure d’activité comprise.'
                    : 'Trois semaines de pesée en disent plus qu’une équation.'}
                </p>
              </div>
              <Switch
                id="manual-toggle"
                checked={manualEnabled}
                onCheckedChange={(checked) =>
                  set(
                    'manualTargetKcal',
                    checked ? (target?.targetKcal ?? MANUAL_TARGET_SUGGESTION) : null,
                  )
                }
              />
            </div>

            {manualEnabled ? (
              <div className="mt-3.5">
                <NumberField
                  id="manualTarget"
                  label="Ma cible quotidienne (kcal)"
                  required
                  value={values.manualTargetKcal ?? Number.NaN}
                  // Un champ vidé reste en manuel : `null` éteindrait l'interrupteur.
                  onChange={(value) => set('manualTargetKcal', Math.round(value))}
                  hint={`Entre ${manualFloor} et ${MANUAL_TARGET_MAX} kcal. Les macronutriments sont répartis dessus.`}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {target ? <TargetCard target={target} /> : null}

      {target?.floored ? (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>
            Le rythme demandé passerait sous ton métabolisme de base ou sous le minimum
            acceptable. La cible a été relevée. Vise un rythme plus lent, ou bouge davantage.
          </AlertDescription>
        </Alert>
      ) : null}

      {target?.activityCapped ? (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>
            La dépense remontée par Santé dépasse ce qu&apos;un corps humain soutient. Elle a été
            ramenée à son plafond, et ton raccourci est probablement à revoir.
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}

      <BottomBar>
        <Button type="submit" disabled={pending || values.birthDate === ''} className="w-full">
          {pending ? 'Calcul…' : target ? 'Recalculer ma cible' : 'Calculer ma cible'}
        </Button>
      </BottomBar>
    </form>
  );
}
