'use client';

import { ArrowRightIcon, CheckIcon, ChevronLeftIcon, DumbbellIcon, TargetIcon, UsersIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { saveIdentity } from '@/lib/client/social';
import { generateProgram, savePreferences } from '@/lib/client/training';
import { saveWeighIn } from '@/lib/client/weight';
import { isJournalDate } from '@/lib/date';
import {
  MANUAL_TARGET_MAX_KCAL,
  MAX_GAIN_RATE_PERCENT,
  MAX_LOSS_RATE_PERCENT,
  type ActivityLevel,
  type Goal,
  type Sex,
} from '@/lib/energy';
import { formatKcal } from '@/lib/nutrition';
import {
  DISPLAY_NAME_MAX,
  HANDLE_MAX,
  HANDLE_MIN,
  initialsOf,
  isValidHandle,
  normalizeHandle,
} from '@/lib/social';
import { cn, parseDecimal } from '@/lib/utils';
import type {
  EquipmentPreference,
  TrainingFocus,
  TrainingPreferences,
  WorkoutTemplate,
} from '@/lib/workout';
import type { Profile } from '@/server/services/profile';

/**
 * Le premier lancement (maquette 5b), en sept écrans :
 *
 *   0  Bienvenue
 *   1a Tes mesures        1b Ton activité, ton but        1c Ta cible
 *   2  Comment te trouver
 *   3a Tes séances        3b Ton programme
 *
 * Chaque étape écrit ce qu'elle a demandé avant de passer à la suivante : un
 * abandon en cours de route garde ce qui a été répondu. Les champs reprennent
 * ceux des formulaires existants — profil, identité, préférences — et vont aux
 * mêmes routes.
 */

type Step = 'welcome' | 'measures' | 'activity' | 'target' | 'identity' | 'sessions' | 'program';

const ACTIVITIES: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sédentaire, pas de sport' },
  { value: 'light', label: 'Léger, 1 à 3 séances' },
  { value: 'moderate', label: 'Modéré, 3 à 5 séances' },
  { value: 'active', label: 'Actif, 6 à 7 séances' },
  { value: 'veryActive', label: 'Très actif, métier physique' },
];

const GOALS: { value: Goal; label: string }[] = [
  { value: 'lose', label: 'Perdre' },
  { value: 'maintain', label: 'Maintenir' },
  { value: 'gain', label: 'Prendre' },
];

const FOCUS: { value: TrainingFocus; label: string; hint: string }[] = [
  { value: 'upper', label: 'Haut', hint: 'Haut du corps, avec un minimum de bas.' },
  { value: 'lower', label: 'Bas', hint: 'Bas du corps, avec un minimum de haut.' },
  { value: 'full', label: 'Les deux', hint: 'Les deux à parts égales.' },
];

const EQUIPMENT: { value: EquipmentPreference; label: string }[] = [
  { value: 'free', label: 'Poids libres' },
  { value: 'machine', label: 'Machines guidées' },
  { value: 'any', label: 'Indifférent' },
];

const RHYTHMS = [2, 3, 4, 5, 6] as const;

/** La valeur du sélecteur de salle quand on ne la précise pas. */
const NO_GYM = 'none';

interface Target {
  bmrKcal: number;
  maintenanceKcal: number;
  adjustmentKcal: number;
  targetKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Un choix en segments, à la couleur de l'étape. */
function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  track,
  className,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  track: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex rounded-lg p-[3px] font-medium', track, className)}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex-1 rounded-[11px] py-2.5 text-center',
            option.value === value ? 'bg-card text-foreground' : 'text-muted-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium">{label}</span>
      {children}
      {hint ? <span className="text-[12.5px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function formatNumber(value: number): string {
  return Number.isNaN(value) ? '' : String(value).replace('.', ',');
}

export function WelcomeFlow({
  profile,
  identity,
  preferences,
  gyms,
}: {
  profile: Profile | null;
  identity: { handle: string | null; displayName: string | null };
  preferences: TrainingPreferences;
  gyms: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1 · Objectif
  const [sex, setSex] = useState<Sex>(profile?.sex ?? 'female');
  const [height, setHeight] = useState(profile === null ? '' : formatNumber(profile.heightCm));
  const [weight, setWeight] = useState(profile === null ? '' : formatNumber(profile.weightKg));
  const [birthDate, setBirthDate] = useState(profile?.birthDate ?? '');
  const [bodyFat, setBodyFat] = useState(
    profile?.bodyFatPercent == null ? '' : formatNumber(profile.bodyFatPercent),
  );
  const [activity, setActivity] = useState<ActivityLevel>(profile?.activity ?? 'moderate');
  const [goal, setGoal] = useState<Goal>(profile?.goal ?? 'maintain');
  const [rate, setRate] = useState(profile?.ratePercentPerWeek ?? 0);
  const [target, setTarget] = useState<Target | null>(null);
  const [manual, setManual] = useState<string | null>(null);

  // 2 · Communauté
  const [handle, setHandle] = useState(identity.handle ?? '');
  const [displayName, setDisplayName] = useState(identity.displayName ?? '');

  // 3 · Séances
  const [focus, setFocus] = useState<TrainingFocus>(preferences.focus);
  const [gymId, setGymId] = useState<number | null>(preferences.gymId);
  const [equipment, setEquipment] = useState<EquipmentPreference>(preferences.equipment);
  const [perWeek, setPerWeek] = useState<number>(preferences.sessionsPerWeek);
  const [program, setProgram] = useState<WorkoutTemplate[]>([]);

  const heightCm = Number.parseInt(height, 10);
  const weightKg = parseDecimal(weight);
  const bodyFatPercent = bodyFat.trim() === '' ? null : parseDecimal(bodyFat);
  const maxRate = goal === 'lose' ? MAX_LOSS_RATE_PERCENT : goal === 'gain' ? MAX_GAIN_RATE_PERCENT : 0;
  const normalizedHandle = normalizeHandle(handle);
  const handleValid = isValidHandle(normalizedHandle);

  function go(next: Step) {
    setError(null);
    setStep(next);
  }

  function changeGoal(next: Goal) {
    setGoal(next);
    setRate(next === 'lose' ? 0.5 : next === 'gain' ? 0.25 : 0);
  }

  function checkMeasures(): boolean {
    if (!Number.isInteger(heightCm) || heightCm < 100 || heightCm > 250) {
      setError('Une taille en centimètres, entre 100 et 250.');
      return false;
    }
    if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) {
      setError('Un poids en kilos, entre 30 et 300.');
      return false;
    }
    if (!isJournalDate(birthDate)) {
      setError('La date de naissance est incomplète.');
      return false;
    }
    if (bodyFatPercent !== null && (!Number.isFinite(bodyFatPercent) || bodyFatPercent < 3 || bodyFatPercent > 60)) {
      setError('La masse grasse, entre 3 et 60 %, ou rien.');
      return false;
    }
    return true;
  }

  async function saveProfile(manualTargetKcal: number | null): Promise<Target | null> {
    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sex,
        birthDate,
        heightCm,
        weightKg,
        bodyFatPercent,
        activity,
        goal,
        ratePercentPerWeek: goal === 'maintain' ? 0 : rate,
        manualTargetKcal,
      }),
    }).catch(() => null);
    if (response === null || !response.ok) {
      return null;
    }
    return ((await response.json()) as { target: Target }).target;
  }

  async function computeTarget() {
    if (!checkMeasures()) {
      go('measures');
      return;
    }
    setBusy(true);
    setError(null);
    const saved = await saveProfile(null);
    if (saved === null) {
      setBusy(false);
      setError('Ces mesures n’ont pas pu être enregistrées. Vérifie-les.');
      return;
    }
    // Le poids saisi devient la première pesée, visible dans Moi.
    await saveWeighIn(weightKg);
    setBusy(false);
    setTarget(saved);
    setManual(null);
    go('target');
  }

  async function confirmTarget() {
    if (manual !== null) {
      const kcal = Number.parseInt(manual, 10);
      if (!Number.isInteger(kcal) || kcal < 1000 || kcal > MANUAL_TARGET_MAX_KCAL) {
        setError(`Une cible entre 1 000 et ${formatKcal(MANUAL_TARGET_MAX_KCAL)} kcal.`);
        return;
      }
      setBusy(true);
      const saved = await saveProfile(kcal);
      setBusy(false);
      if (saved === null) {
        setError('La cible n’a pas pu être enregistrée.');
        return;
      }
      setTarget(saved);
    }
    go('identity');
  }

  async function confirmIdentity() {
    if (!handleValid) {
      setError(`Un identifiant de ${HANDLE_MIN} à ${HANDLE_MAX} caractères : lettres, chiffres et _.`);
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await saveIdentity(normalizedHandle, displayName.trim() === '' ? null : displayName.trim());
    setBusy(false);
    if (outcome.kind === 'saved') {
      go('sessions');
      return;
    }
    setError(outcome.kind === 'taken' ? 'Cet identifiant est déjà pris.' : 'L’identifiant n’a pas pu être enregistré.');
  }

  async function composeProgram() {
    setBusy(true);
    setError(null);
    const saved = await savePreferences({ gymId, focus, equipment, sessionsPerWeek: perWeek });
    const generated = saved.kind === 'saved' ? await generateProgram() : null;
    if (generated === null || generated.kind !== 'generated') {
      setBusy(false);
      setError('Le programme n’a pas pu être composé.');
      return;
    }
    const response = await fetch('/api/training', { cache: 'no-store' }).catch(() => null);
    const templates =
      response !== null && response.ok
        ? ((await response.json()) as { templates: WorkoutTemplate[] }).templates
        : [];
    setBusy(false);
    setProgram(templates.filter((template) => template.kind === 'program'));
    go('program');
  }

  function finish() {
    router.replace('/?bienvenue=1');
    router.refresh();
  }

  const back: Partial<Record<Step, Step>> = {
    measures: 'welcome',
    activity: 'measures',
    target: 'activity',
    identity: 'target',
    sessions: 'identity',
    program: 'sessions',
  };

  // La barre du haut : trois segments, à la couleur de chaque étape.
  const fill: Record<Step, [number, number, number]> = {
    welcome: [0, 0, 0],
    measures: [33, 0, 0],
    activity: [66, 0, 0],
    target: [100, 0, 0],
    identity: [100, 50, 0],
    sessions: [100, 100, 50],
    program: [100, 100, 100],
  };
  const colors = ['var(--nutri)', 'var(--social)', 'var(--sport)'];

  const primary =
    'flex h-[54px] w-full items-center justify-center gap-2 rounded-full text-base font-semibold disabled:opacity-60';
  const secondary = 'w-full py-1.5 text-center text-sm font-medium text-muted-foreground';

  let body: React.ReactNode;
  let footer: React.ReactNode;

  if (step === 'welcome') {
    body = (
      <div className="flex flex-col gap-7 pt-12">
        <div className="flex flex-col gap-2.5">
          <p className="text-sm font-semibold text-nutri-ink">Compte créé</p>
          <h1 className="text-[34px] leading-[1.1] font-semibold tracking-[-0.035em] text-pretty">
            Trois réglages, et l’app est à toi.
          </h1>
          <p className="text-[15px] text-muted-foreground">Deux minutes environ. Tout se modifie ensuite.</p>
        </div>
        <ol className="flex flex-col gap-2.5">
          {[
            { n: 1, title: 'Mon objectif', hint: 'Mesures, activité, cible calorique', icon: TargetIcon, box: 'bg-nutri-soft', dot: 'bg-nutri text-nutri-on', ink: 'text-nutri-ink' },
            { n: 2, title: 'Mon profil Communauté', hint: 'L’identifiant par lequel on te trouve', icon: UsersIcon, box: 'bg-social-soft', dot: 'bg-social text-social-on', ink: 'text-social-ink' },
            { n: 3, title: 'Mes séances', hint: 'Ta salle, ton matériel, ton rythme', icon: DumbbellIcon, box: 'bg-sport-soft', dot: 'bg-sport text-sport-on', ink: 'text-sport-ink' },
          ].map((item) => (
            <li key={item.n} className={cn('flex items-center gap-3.5 rounded-xl px-4 py-3.5', item.box)}>
              <span className={cn('flex size-8 flex-none items-center justify-center rounded-full font-semibold', item.dot)}>
                {item.n}
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-semibold">{item.title}</span>
                <span className="block text-[12.5px] text-muted-foreground">{item.hint}</span>
              </span>
              <item.icon aria-hidden className={cn('size-[18px]', item.ink)} />
            </li>
          ))}
        </ol>
      </div>
    );
    footer = (
      <button type="button" onClick={() => go('measures')} className={cn(primary, 'bg-nutri text-nutri-on')}>
        Commencer
        <ArrowRightIcon aria-hidden className="size-[18px]" />
      </button>
    );
  } else if (step === 'measures') {
    body = (
      <>
        <StepTitle kicker="Étape 1 sur 3 · Objectif" ink="text-nutri-ink" title="Tes mesures" lead="Elles servent à estimer ta dépense du jour." />
        <div className="flex flex-col gap-4">
          <Field label="Sexe">
            <Segmented
              label="Sexe"
              track="bg-nutri-soft"
              value={sex}
              onChange={setSex}
              options={[
                { value: 'male', label: 'Homme' },
                { value: 'female', label: 'Femme' },
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Taille (cm)">
              <Input inputMode="numeric" value={height} onChange={(event) => setHeight(event.target.value)} />
            </Field>
            <Field label="Poids (kg)">
              <Input inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} />
            </Field>
          </div>
          <Field label="Date de naissance">
            <Input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
          </Field>
          <Field label="Masse grasse, si connue (%)">
            <Input inputMode="decimal" placeholder="Laisser vide" value={bodyFat} onChange={(event) => setBodyFat(event.target.value)} />
          </Field>
          <p className="text-[12.5px] text-muted-foreground">Ce poids devient ta première pesée, visible dans Moi.</p>
        </div>
      </>
    );
    footer = (
      <button type="button" onClick={() => checkMeasures() && go('activity')} className={cn(primary, 'bg-nutri text-nutri-on')}>
        Continuer
      </button>
    );
  } else if (step === 'activity') {
    const kgPerWeek = Number.isFinite(weightKg) ? (weightKg * rate) / 100 : null;
    body = (
      <>
        <StepTitle kicker="Étape 1 sur 3 · Objectif" ink="text-nutri-ink" title="Ton activité, ton but" />
        <div role="radiogroup" aria-label="Activité" className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Activité</span>
          <div className="overflow-hidden rounded-2xl border bg-card">
            {ACTIVITIES.map((option, index) => {
              const checked = option.value === activity;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => setActivity(option.value)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3.5 py-3 text-left text-sm',
                    index > 0 && 'border-t border-divider',
                    checked && 'bg-nutri-soft font-semibold',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'size-[18px] flex-none rounded-full',
                      checked ? 'border-[5px] border-nutri-ink' : 'border-[1.5px] border-faint',
                    )}
                  />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <Field label="Objectif">
          <Segmented label="Objectif" track="bg-nutri-soft" value={goal} onChange={changeGoal} options={GOALS} />
        </Field>
        {goal === 'maintain' ? null : (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-[13px]">
              <span className="font-medium">Rythme visé, par semaine</span>
              <span className="font-semibold">{formatNumber(rate)} %</span>
            </div>
            <Slider
              aria-label="Rythme visé, en pour cent du poids par semaine"
              min={0.1}
              max={maxRate}
              step={0.05}
              value={[rate]}
              onValueChange={(values) => setRate(Math.round((values[0] ?? rate) * 100) / 100)}
            />
            {kgPerWeek === null ? null : (
              <p className="text-[12.5px] text-muted-foreground">
                Soit environ {formatNumber(Math.round(kgPerWeek * 10) / 10)} kg par semaine.
              </p>
            )}
          </div>
        )}
      </>
    );
    footer = (
      <button type="button" disabled={busy} onClick={() => void computeTarget()} className={cn(primary, 'bg-nutri text-nutri-on')}>
        {busy ? 'Calcul…' : 'Calculer ma cible'}
      </button>
    );
  } else if (step === 'target' && target !== null) {
    const energy = target.proteinG * 4 + target.carbsG * 4 + target.fatG * 9 || 1;
    const p = (target.proteinG * 4 * 100) / energy;
    const c = p + (target.carbsG * 4 * 100) / energy;
    body = (
      <>
        <StepTitle kicker="Étape 1 sur 3 · Objectif" ink="text-nutri-ink" title="Ta cible quotidienne" />
        <div className="flex flex-col items-center gap-[18px] rounded-[22px] border bg-card p-[22px]">
          <div
            className="flex size-[150px] items-center justify-center rounded-full"
            style={{ background: `conic-gradient(var(--protein) 0 ${p}%, var(--carb) ${p}% ${c}%, var(--fat) ${c}% 100%)` }}
          >
            <div className="flex size-[122px] flex-col items-center justify-center rounded-full bg-card">
              <span className="text-[34px] leading-none font-bold tracking-[-0.035em] text-nutri-ink">
                {formatKcal(target.targetKcal)}
              </span>
              <span className="text-xs text-muted-foreground">kcal par jour</span>
            </div>
          </div>
          <div className="grid w-full grid-cols-3 text-center">
            {[
              { label: 'Protéines', value: target.proteinG, dot: 'bg-protein' },
              { label: 'Glucides', value: target.carbsG, dot: 'bg-carb' },
              { label: 'Lipides', value: target.fatG, dot: 'bg-fat' },
            ].map((macro) => (
              <div key={macro.label}>
                <p className="text-[17px] font-semibold">{Math.round(macro.value)} g</p>
                <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <span aria-hidden className={cn('size-[7px] rounded-full', macro.dot)} />
                  {macro.label}
                </p>
              </div>
            ))}
          </div>
          <dl className="flex w-full flex-col gap-1.5 border-t border-divider pt-3 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Métabolisme de base</dt>
              <dd className="font-medium">{formatKcal(target.bmrKcal)} kcal</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Dépense estimée</dt>
              <dd className="font-medium">{formatKcal(target.maintenanceKcal)} kcal</dd>
            </div>
            {target.adjustmentKcal === 0 ? null : (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {target.adjustmentKcal < 0 ? 'Déficit pour « Perdre »' : 'Surplus pour « Prendre »'}
                </dt>
                <dd className="font-medium">
                  {target.adjustmentKcal < 0 ? '−' : '+'}
                  {formatKcal(Math.abs(target.adjustmentKcal))} kcal
                </dd>
              </div>
            )}
          </dl>
        </div>
        {manual === null ? (
          <p className="text-center text-[12.5px] text-muted-foreground">
            La cible s’ajuste les jours d’entraînement. Tu la retrouves sur la jauge d’Aujourd’hui.
          </p>
        ) : (
          <Field label="Ma cible, en kcal par jour">
            <Input inputMode="numeric" value={manual} onChange={(event) => setManual(event.target.value)} autoFocus />
          </Field>
        )}
      </>
    );
    footer = (
      <>
        <button type="button" disabled={busy} onClick={() => void confirmTarget()} className={cn(primary, 'bg-nutri text-nutri-on')}>
          Valider et continuer
        </button>
        {manual === null ? (
          <button type="button" onClick={() => setManual(String(target.targetKcal))} className={secondary}>
            Saisir ma cible à la main
          </button>
        ) : (
          <button type="button" onClick={() => setManual(null)} className={secondary}>
            Garder la cible calculée
          </button>
        )}
      </>
    );
  } else if (step === 'identity') {
    const preview = displayName.trim() === '' ? (handleValid ? normalizedHandle : 'Toi') : displayName.trim();
    body = (
      <>
        <StepTitle
          kicker="Étape 2 sur 3 · Communauté"
          ink="text-social-ink"
          title="Comment te trouver"
          lead="Tes amis te suivent par ton identifiant et voient tes séances."
        />
        <div className="flex items-center gap-3 rounded-[18px] border bg-card p-3.5">
          <span className="flex size-11 flex-none items-center justify-center rounded-full bg-social-soft text-[15px] font-semibold text-social-ink">
            {initialsOf(preview)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{preview}</p>
            <p className="truncate text-[13px] text-muted-foreground">@{handleValid ? normalizedHandle : '…'}</p>
          </div>
          <span className="text-[11.5px] text-muted-foreground">Aperçu</span>
        </div>
        <div className="flex flex-col gap-4">
          <Field
            label="Identifiant"
            hint={`Unique, ${HANDLE_MIN} à ${HANDLE_MAX} caractères : lettres, chiffres et _. C’est par lui qu’on te trouve.`}
          >
            <div
              className={cn(
                'flex h-[50px] items-center gap-0.5 rounded-lg border bg-card px-3.5 text-base font-medium',
                handleValid ? 'border-[1.5px] border-social-ink' : 'border-input',
              )}
            >
              <span className="text-faint">@</span>
              <input
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={HANDLE_MAX + 1}
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
              {handleValid ? <CheckIcon aria-hidden className="size-[18px] text-sport-ink" /> : null}
            </div>
          </Field>
          <Field label="Nom affiché" hint="Facultatif, et pas forcément unique. Ton adresse n’est jamais montrée.">
            <Input value={displayName} maxLength={DISPLAY_NAME_MAX} onChange={(event) => setDisplayName(event.target.value)} />
          </Field>
        </div>
      </>
    );
    footer = (
      <>
        <button type="button" disabled={busy} onClick={() => void confirmIdentity()} className={cn(primary, 'bg-social text-social-on')}>
          {busy ? 'Enregistrement…' : 'Continuer'}
        </button>
        <button type="button" onClick={() => go('sessions')} className={secondary}>
          Plus tard
        </button>
      </>
    );
  } else if (step === 'sessions') {
    body = (
      <>
        <StepTitle
          kicker="Étape 3 sur 3 · Séances"
          ink="text-sport-ink"
          title="Tes séances"
          lead="Quatre réponses, et le programme se compose."
        />
        <Field label="Ce que je veux travailler" hint={FOCUS.find((item) => item.value === focus)?.hint}>
          <Segmented label="Ce que je veux travailler" track="bg-sport-mid" value={focus} onChange={setFocus} options={FOCUS} />
        </Field>
        <Field label="Ma salle" hint="Les exercices sont limités à ce que cette enseigne propose.">
          <Select
            value={gymId === null ? NO_GYM : String(gymId)}
            onValueChange={(value) => setGymId(value === NO_GYM ? null : Number(value))}
          >
            <SelectTrigger className="w-full" aria-label="Ma salle">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_GYM}>Autre, ou je ne précise pas</SelectItem>
              {gyms.map((gym) => (
                <SelectItem key={gym.id} value={String(gym.id)}>
                  {gym.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Poids libre ou machine">
          <Segmented
            label="Poids libre ou machine"
            track="bg-sport-mid"
            className="text-[13.5px]"
            value={equipment}
            onChange={setEquipment}
            options={EQUIPMENT}
          />
        </Field>
        <Field label="Séances par semaine">
          <Segmented
            label="Séances par semaine"
            track="bg-sport-mid"
            className="text-[15px] font-semibold"
            value={perWeek}
            onChange={setPerWeek}
            options={RHYTHMS.map((value) => ({ value, label: String(value) }))}
          />
        </Field>
      </>
    );
    footer = (
      <button type="button" disabled={busy} onClick={() => void composeProgram()} className={cn(primary, 'bg-sport text-sport-on')}>
        {busy ? 'Composition…' : 'Composer mon programme'}
      </button>
    );
  } else {
    const gymName = gyms.find((gym) => gym.id === gymId)?.name ?? 'salle non précisée';
    body = (
      <>
        <StepTitle
          kicker="Étape 3 sur 3 · Séances"
          ink="text-sport-ink"
          title="Ton programme"
          lead={`${FOCUS.find((item) => item.value === focus)?.label === 'Les deux' ? 'Haut et bas' : FOCUS.find((item) => item.value === focus)?.label} · ${gymName} · ${EQUIPMENT.find((item) => item.value === equipment)?.label.toLowerCase()} · ${perWeek} par semaine`}
        />
        <ul className="flex flex-col gap-2.5">
          {program.map((template) => (
            <li key={template.id} className="flex flex-col gap-2 rounded-[18px] bg-sport-soft px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[15px] font-semibold">{template.name}</p>
                <span className="flex-none text-xs text-muted-foreground">
                  {template.exercises.length} exercice{template.exercises.length > 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-[13px] leading-[1.55] text-muted-foreground">
                {template.exercises.map((entry) => entry.exercise.name).join(' · ')}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-[12.5px] text-muted-foreground">Tu pourras tout modifier depuis Sport.</p>
      </>
    );
    footer = (
      <>
        <button type="button" onClick={finish} className={cn(primary, 'bg-sport text-sport-on')}>
          Terminer
        </button>
        <button type="button" onClick={() => go('sessions')} className={secondary}>
          Revoir mes réponses
        </button>
      </>
    );
  }

  const previous = back[step];
  return (
    <div className="flex min-h-[calc(var(--viewport-height)-var(--safe-top)-1rem)] flex-col px-1.5 pt-3">
      {step === 'welcome' ? null : (
        <div className="mb-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => previous !== undefined && go(previous)}
            aria-label="Étape précédente"
            className="-ml-1"
          >
            <ChevronLeftIcon aria-hidden className="size-[22px]" />
          </button>
          <div aria-hidden className="flex flex-1 gap-[5px]">
            {fill[step].map((percent, index) => (
              <span
                key={index}
                className="h-[5px] flex-1 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${colors[index]} ${percent}%, var(--track) ${percent}%)`,
                }}
              />
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-5">{body}</div>
      {error !== null ? (
        <p role="alert" className="mt-4 text-center text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
      <div className="sticky bottom-0 mt-6 flex flex-col gap-2.5 bg-background pt-2 pb-[calc(1.5rem+var(--safe-bottom))]">
        {footer}
      </div>
    </div>
  );
}

function StepTitle({
  kicker,
  ink,
  title,
  lead,
}: {
  kicker: string;
  ink: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className={cn('text-[13px] font-semibold', ink)}>{kicker}</p>
      <h1 className="text-[28px] leading-[1.15] font-semibold tracking-[-0.03em]">{title}</h1>
      {lead ? <p className="text-sm text-muted-foreground">{lead}</p> : null}
    </div>
  );
}
