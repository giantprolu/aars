'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BottomBar } from '@/components/BottomBar';
import { ErrorAlert } from '@/components/ErrorAlert';
import { NavHeader, PageTitle } from '@/components/ScreenHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { generateProgram, savePreferences } from '@/lib/client/training';
import {
  EQUIPMENT_PREFERENCE_LABELS,
  FOCUS_LABELS,
  MAX_SESSIONS_PER_WEEK,
  MIN_SESSIONS_PER_WEEK,
  type EquipmentPreference,
  type Gym,
  type TrainingFocus,
  type TrainingPreferences,
} from '@/lib/workout';

/**
 * Les réponses qui composent le programme.
 *
 * Trois questions, et une seule action en bas : enregistrer refait le
 * programme dans la foulée. Séparer les deux gestes laisserait des réponses
 * enregistrées sans effet visible, c'est-à-dire l'impression que rien ne s'est
 * passé — et personne ne devinerait qu'il faut un second appui ailleurs.
 *
 * L'orientation ne supprime jamais l'autre moitié du corps. Le texte le dit
 * sous chaque choix, parce que c'est la crainte raisonnable qu'on a en
 * cochant « haut du corps », et qu'elle mérite une réponse avant l'appui.
 */
const FOCUS_HINTS: Record<TrainingFocus, string> = {
  upper: 'Chaque séance garde un exercice de jambes.',
  lower: 'Chaque séance garde un exercice du haut.',
  full: 'Poussée, tirage et jambes en rotation.',
};

const EQUIPMENT_HINTS: Record<EquipmentPreference, string> = {
  free: 'Barre et haltères en premier, machines en secours.',
  machine: 'Machines et poulies en premier, poids libres en secours.',
  any: 'Le meilleur exercice du groupe, quel que soit le matériel.',
};

export function PreferencesForm({
  preferences,
  gyms,
}: {
  preferences: TrainingPreferences;
  gyms: readonly Gym[];
}) {
  const router = useRouter();
  const [gymId, setGymId] = useState<number | null>(preferences.gymId);
  const [focus, setFocus] = useState<TrainingFocus>(preferences.focus);
  const [equipment, setEquipment] = useState<EquipmentPreference>(preferences.equipment);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(preferences.sessionsPerWeek);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[] | null>(null);

  const chosenGym = gyms.find((gym) => gym.id === gymId) ?? null;

  async function submit() {
    setBusy(true);
    setError(null);
    setMissing(null);

    const saved = await savePreferences({ gymId, focus, equipment, sessionsPerWeek });
    if (saved.kind === 'error') {
      setBusy(false);
      setError('Les réponses n’ont pas pu être enregistrées.');
      return;
    }

    const generated = await generateProgram();
    setBusy(false);

    if (generated.kind === 'error') {
      setError('Le programme n’a pas pu être composé. Réessaie dans un instant.');
      return;
    }
    if (generated.created === 0) {
      setError('Aucun exercice disponible pour ces réponses. Essaie une autre salle.');
      return;
    }
    if (generated.missingGroups.length > 0) {
      // Le programme est écrit malgré tout : une séance amputée d'un groupe
      // reste une séance, et l'utilisateur doit savoir lequel manque plutôt
      // que de le découvrir sur place.
      setMissing(generated.missingGroups);
    }

    router.push('/training');
    router.refresh();
  }

  /** Valeur du sélecteur de salle : Radix refuse la chaîne vide comme valeur d'option. */
  const NO_GYM = 'none';

  return (
    <>
      <NavHeader label="Sport" href="/training" />

      <PageTitle
        title="Mes séances"
        description="Trois réponses, et le programme se compose. Il se refait à volonté : les séances remplacées sont archivées, jamais perdues."
        className="mb-5"
      />

      <div className="flex flex-col gap-5">
        <div className="grid gap-2">
          <Label id="focus-label">Ce que je veux travailler</Label>
          <Tabs
            value={focus}
            onValueChange={(value) =>
              (value === 'upper' || value === 'lower' || value === 'full') && setFocus(value)
            }
          >
            <TabsList aria-labelledby="focus-label" className="w-full">
              {(['upper', 'lower', 'full'] as const).map((value) => (
                <TabsTrigger key={value} value={value}>
                  {value === 'upper' ? 'Haut' : value === 'lower' ? 'Bas' : 'Les deux'}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <p className="text-[12.5px] text-muted-foreground">
            {FOCUS_LABELS[focus]}. {FOCUS_HINTS[focus]}
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="gym">Ma salle</Label>
          <Select
            value={gymId === null ? NO_GYM : String(gymId)}
            onValueChange={(value) => setGymId(value === NO_GYM ? null : Number(value))}
          >
            <SelectTrigger id="gym" className="w-full data-[size=default]:h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_GYM}>Je ne précise pas</SelectItem>
              {gyms.map((gym) => (
                <SelectItem key={gym.id} value={String(gym.id)}>
                  {gym.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[12.5px] text-muted-foreground">
            {chosenGym === null
              ? 'Tout le catalogue reste proposé.'
              : (chosenGym.note ?? 'Les exercices sont limités à ce que cette enseigne propose.')}
          </p>
        </div>

        <div className="grid gap-2">
          <Label id="equipment-label">Poids libre ou machine</Label>
          <Tabs
            value={equipment}
            onValueChange={(value) =>
              (value === 'free' || value === 'machine' || value === 'any') && setEquipment(value)
            }
          >
            <TabsList aria-labelledby="equipment-label" className="w-full">
              {(['free', 'machine', 'any'] as const).map((value) => (
                <TabsTrigger key={value} value={value}>
                  {EQUIPMENT_PREFERENCE_LABELS[value]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <p className="text-[12.5px] text-muted-foreground">{EQUIPMENT_HINTS[equipment]}</p>
        </div>

        <div className="grid gap-2">
          <Label id="sessions-label">Séances par semaine</Label>
          <Tabs
            value={String(sessionsPerWeek)}
            onValueChange={(value) => setSessionsPerWeek(Number(value))}
          >
            <TabsList aria-labelledby="sessions-label" className="w-full">
              {Array.from(
                { length: MAX_SESSIONS_PER_WEEK - MIN_SESSIONS_PER_WEEK + 1 },
                (_, index) => index + MIN_SESSIONS_PER_WEEK,
              ).map((value) => (
                <TabsTrigger key={value} value={String(value)} className="tabular">
                  {value}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}
      {missing !== null ? (
        <Alert className="mt-4">
          <AlertDescription>
            Aucun exercice disponible pour : {missing.join(', ')}. Ces créneaux ont été laissés
            de côté.
          </AlertDescription>
        </Alert>
      ) : null}

      <BottomBar>
        <Button type="button" onClick={() => void submit()} disabled={busy} className="w-full">
          {busy ? 'Composition…' : 'Composer le programme'}
        </Button>
      </BottomBar>
    </>
  );
}
