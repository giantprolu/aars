'use client';

import { useState } from 'react';
import { StepList } from '@/components/StepList';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatRelativeJournalDate } from '@/lib/date';
import { CopyField } from './CopyField';

/**
 * Pont vers Santé d'Apple, par l'app Raccourcis (FR-27).
 *
 * HealthKit n'est ouvert qu'aux applications natives iOS : aucune page web n'y
 * accède, et il n'existe pas d'API web équivalente. Raccourcis est le seul
 * chemin qui ne passe pas par l'App Store, puisqu'il sait à la fois lire un
 * échantillon de santé et appeler une adresse web.
 *
 * Le jeton n'est affiché qu'au moment où il est fabriqué. Il n'est pas secret
 * au même titre qu'un mot de passe, il n'ouvre qu'une route en écriture, mais
 * le réafficher en permanence inviterait à le laisser traîner.
 */
export interface BridgeStatus {
  /** Dernière journée reçue, formatée pour l'affichage. */
  lastDay: string | null;
  lastKcal: number | null;
  /** Journées complètes retenues, et la dépense médiane de ces journées. */
  dayCount: number;
  typicalKcal: number;
  /** Plus forte journée de la fenêtre, qui trahit une mesure aberrante. */
  peakKcal: number;
  /** Nombre de journées requis avant que la cible bascule. */
  requiredDays: number;
}

/** À assembler soi-même, faute de raccourci partagé configuré. */
const MANUAL_STEPS = [
  'Fabrique un jeton ci-dessous et copie-le.',
  'Dans Raccourcis, ajoute « Rechercher des échantillons de l’app Santé », type Énergie active, sur aujourd’hui.',
  'Ajoute « Calculer les statistiques », opération Somme, sur les valeurs.',
  'Ajoute « Obtenir le contenu de l’URL », et non « de la page web », sur l’adresse ci-dessous. Touche « Afficher plus » pour déplier les réglages : méthode POST, en-tête x-ingest-token valant le jeton, corps JSON avec un champ Nombre activeKcal valant la somme.',
  'Dans Automatisation, déclenche-le chaque soir à 23 h 55.',
];

/**
 * Avec le lien, il ne reste qu'à coller deux valeurs et à poser l'horaire.
 *
 * La dernière étape reste manuelle et le restera : Apple ne permet pas de
 * partager une automatisation personnelle, seulement un raccourci. Le dire
 * franchement vaut mieux que de laisser croire que tout est réglé, et de
 * découvrir huit jours plus tard qu'aucune journée n'est remontée.
 */
const SHARED_STEPS = [
  'Fabrique un jeton ci-dessous et copie-le.',
  'Touche « Ajouter le raccourci ». Raccourcis s’ouvre et demande deux valeurs.',
  'Colle l’adresse puis le jeton quand il les réclame, et valide l’ajout.',
  'Dans Raccourcis, onglet Automatisation, crée un déclenchement quotidien à 23 h 55 sur ce raccourci. Cette étape ne peut pas être partagée : Apple n’exporte que les raccourcis, jamais les automatisations.',
];

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular text-right">{value}</dd>
    </div>
  );
}

/**
 * Le pont, avec ou sans raccourci tout fait.
 *
 * `shortcutUrl` est le lien iCloud d'un raccourci déjà assemblé, quand
 * l'installation en publie un. Un raccourci se partage ; une automatisation ne
 * se partage pas, Apple n'exportant que le premier. Le lien épargne donc les
 * cinq actions à monter à la main, mais le déclenchement quotidien reste à
 * créer sur l'appareil, et c'est irréductible.
 *
 * Le raccourci partagé est le même pour tout le monde et ne peut donc pas
 * porter le jeton de quelqu'un : c'est la fonction « questions à
 * l'importation » de l'app Raccourcis qui le réclame au moment de l'ajout.
 * Sans elle, un lien unique donnerait à chaque personne le compte de celle qui
 * l'a fabriqué.
 */
export function HealthBridge({
  hasToken,
  status,
  shortcutUrl,
}: {
  hasToken: boolean;
  status: BridgeStatus;
  /** Lien iCloud du raccourci tout fait, ou `null` s'il faut l'assembler. */
  shortcutUrl: string | null;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Lue au rendu client : l'adresse dépend de l'origine d'où la page est
  // ouverte, et c'est celle-là qu'il faut recopier dans le raccourci.
  const endpoint =
    typeof window === 'undefined' ? '/api/activity' : `${window.location.origin}/api/activity`;

  async function generate() {
    setPending(true);
    try {
      const response = await fetch('/api/ingest-token', { method: 'POST' });
      if (!response.ok) {
        return;
      }
      const body = (await response.json()) as { token: string };
      setToken(body.token);
    } finally {
      setPending(false);
    }
  }

  const missing = status.requiredDays - status.dayCount;
  const steps = shortcutUrl === null ? MANUAL_STEPS : SHARED_STEPS;

  // Seuil de suspicion : au-delà de quatre mille kilocalories actives en une
  // journée, on est hors de ce qu'un humain dépense, cyclistes du Tour compris.
  // Le chiffre est volontairement large ; il ne sert qu'à alerter, le calcul
  // ayant déjà son propre plafond indexé sur le métabolisme de base.
  const suspect = status.peakKcal > 4000;

  return (
    <>
      <p className="mt-1 text-muted-foreground">
        Un raccourci iOS envoie ton énergie active du jour. La cible passe alors sur ta dépense
        réelle, moyennée sur quatorze jours, au lieu du niveau d&apos;activité déclaré. Il faut
        au moins trois journées envoyées pour que la bascule se fasse.
      </p>

      <h2 className="mt-5 mb-2 text-[12.5px] text-muted-foreground">État</h2>
      <Card>
        <CardContent>
      <dl className="flex flex-col gap-2">
        <Line
          label="Dernière journée reçue"
          value={
            status.lastDay === null
              ? '—'
              : `${formatRelativeJournalDate(status.lastDay)}${
                  status.lastKcal === null ? '' : ` · ${Math.round(status.lastKcal)} kcal`
                }`
          }
        />
        <Line
          label="Dépense médiane"
          value={
            status.dayCount === 0
              ? '—'
              : `${Math.round(status.typicalKcal)} kcal sur ${status.dayCount} j`
          }
        />
      </dl>
      <p className="mt-3 text-[12.5px] text-muted-foreground">
        {status.dayCount >= status.requiredDays
          ? 'La cible suit ta dépense mesurée.'
          : `Encore ${missing} journée${missing > 1 ? 's' : ''} avant que la cible bascule sur la mesure.`}
      </p>
        </CardContent>
      </Card>
      {suspect ? (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>
          Une journée de la fenêtre atteint {Math.round(status.peakKcal)} kcal actives, ce
          qu&apos;aucun corps ne dépense. Ton raccourci envoie probablement un cumul et non le
          total du jour : vérifie que « Rechercher des échantillons » porte bien sur aujourd&apos;hui
          seulement. La cible ignore cette journée, elle est calculée sur la médiane.
          </AlertDescription>
        </Alert>
      ) : null}

      <h2 className="mt-5 mb-2 text-[12.5px] text-muted-foreground">Mode d&apos;emploi</h2>
      <StepList steps={steps} />

      {shortcutUrl === null ? null : (
        // Le raccourci ne s'ajoute que depuis un iPhone ou un iPad : sur un
        // ordinateur, le lien ouvre une page qui ne mène à rien.
        <Button asChild className="mt-4 w-full">
          <a href={shortcutUrl} target="_blank" rel="noreferrer">
            Ajouter le raccourci
          </a>
        </Button>
      )}

      <CopyField label="Adresse à appeler" value={endpoint} />

      {token ? (
        <CopyField
          label="Ton jeton, à copier maintenant"
          value={token}
          hint="Il ne sera plus affiché. En refabriquer un annule celui-ci."
        />
      ) : null}

      <Button
        type="button"
        variant="outline"
        onClick={generate}
        disabled={pending}
        className="mt-5 w-full"
      >
        {pending
          ? 'Fabrication…'
          : hasToken || token
            ? 'Fabriquer un nouveau jeton'
            : 'Fabriquer un jeton'}
      </Button>
    </>
  );
}
