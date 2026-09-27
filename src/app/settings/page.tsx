import {
  ActivityIcon,
  BellIcon,
  ChevronRightIcon,
  DatabaseIcon,
  DownloadIcon,
  KeyRoundIcon,
  LockIcon,
  SmartphoneIcon,
  SunMoonIcon,
  TargetIcon,
} from 'lucide-react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { AppearanceForm } from './appearance/AppearanceForm';
import { LockButton } from './LockButton';
import { DeleteAccountButton, RecoveryCodeButton, ReminderSwitch } from './AccountRows';
import { currentUserId } from '@/server/guard';
import { hasIngestToken } from '@/server/db/queries/users';
import { bridgeStatus, targetFor } from '@/server/services/profile';
import { recoveryCodeExists } from '@/server/services/account';
import { pushPublicKey } from '@/server/services/reminders';
import { APP_VERSION } from '@/lib/version';
import { formatStampDate } from '@/lib/date';
import { formatKcal } from '@/lib/nutrition';
import { getCiqualStatus } from '@/server/db/queries/ciqual';
import { THEME_COOKIE, readAppearance } from '@/lib/theme';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Repli quand la base est injoignable : l'écran doit survivre à une panne. */
const EMPTY_STATUS = {
  lastDay: null,
  lastKcal: null,
  dayCount: 0,
  typicalKcal: 0,
  peakKcal: 0,
  requiredDays: 3,
};

/**
 * L'état de la table de référence est indicatif : une base injoignable ne doit
 * pas emporter tout l'écran, dont le reste ne dépend d'aucune donnée (AD-12).
 */
async function readCiqual(): Promise<{ count: string; lastImport: string }> {
  try {
    const status = await getCiqualStatus();
    return {
      count: status.count.toLocaleString('fr-FR'),
      lastImport:
        status.lastImportedAt === null ? 'jamais' : formatStampDate(status.lastImportedAt),
    };
  } catch {
    return { count: '—', lastImport: 'indisponible' };
  }
}

/** Pastille d'icône d'une rangée. */
function RowIcon({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="flex size-8 flex-none items-center justify-center rounded-lg bg-muted [&_svg]:size-[17px]"
    >
      {children}
    </span>
  );
}

/** Contenu d'une rangée : pastille, intitulé, précision, puis ce qui vient à droite. */
function RowBody({
  icon,
  label,
  hint,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      <RowIcon>{icon}</RowIcon>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-medium tracking-tight">{label}</span>
        {hint ? (
          <span className="mt-px block text-[12.5px] text-muted-foreground">{hint}</span>
        ) : null}
      </span>
      {children}
    </>
  );
}

const ROW = 'flex items-center gap-3 border-b px-4 py-3 last:border-b-0';

/** Une rangée qui mène à un écran dédié. */
function LinkRow({
  href,
  ...body
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="border-b last:border-b-0">
      <Link href={href} className={cn(ROW, 'border-b-0 transition-colors active:bg-accent')}>
        <RowBody {...body}>
          {body.children}
          <ChevronRightIcon aria-hidden className="size-4 flex-none text-muted-foreground" />
        </RowBody>
      </Link>
    </li>
  );
}

/**
 * Écran de réglages (FR-24).
 *
 * Un sommaire en cartes groupées : chaque sujet long a son écran, et cette
 * page ne porte que ce qui tient sur une ligne. L'apparence, un choix en trois
 * segments, se règle sur place.
 */
export default async function SettingsPage() {
  const userId = await currentUserId();
  const store = await cookies();
  const appearance = readAppearance(store.get(THEME_COOKIE)?.value);

  const [ciqual, tokenExists, status, target, recoveryCode] = await Promise.all([
    readCiqual(),
    userId === null ? Promise.resolve(false) : hasIngestToken(userId),
    userId === null
      ? Promise.resolve(EMPTY_STATUS)
      : bridgeStatus(userId).catch(() => EMPTY_STATUS),
    userId === null ? Promise.resolve(null) : targetFor(userId).catch(() => null),
    userId === null ? Promise.resolve(false) : recoveryCodeExists(userId).catch(() => false),
  ]);

  const bridgeLabel = !tokenExists
    ? 'Inactif'
    : status.dayCount >= status.requiredDays
      ? 'Actif'
      : 'En attente';

  const bridgeHint = !tokenExists
    ? 'Raccourci iOS · aucun jeton'
    : status.dayCount === 0
      ? 'Raccourci iOS · aucune journée reçue'
      : `Raccourci iOS · ${status.dayCount} ${status.dayCount > 1 ? 'jours reçus' : 'jour reçu'}`;

  return (
    <>
      <ScreenHeader title="Réglages" />

      <Card asChild className="flex-row items-center gap-3 p-4">
        <Link href="/profile" className="transition-colors active:bg-accent">
          <Avatar aria-hidden className="size-11">
            <AvatarFallback>
              <TargetIcon className="size-5" />
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block text-[15.5px] font-medium tracking-tight">Mon objectif</span>
            <span className="tabular mt-px block text-[12.5px] text-muted-foreground">
              {target === null
                ? 'Mesures, activité, cible quotidienne'
                : `Cible ${formatKcal(target.targetKcal)} kcal`}
            </span>
          </span>
          <ChevronRightIcon aria-hidden className="size-4 flex-none text-muted-foreground" />
        </Link>
      </Card>

      <h2 className="mt-5 mb-2 text-[12.5px] text-muted-foreground">Application</h2>
      <Card className="gap-0 overflow-hidden py-0">
        <ul>
          <LinkRow
            href="/settings/install"
            icon={<SmartphoneIcon />}
            label="Installer sur l'écran d'accueil"
            hint="Un bouton sur Android, trois gestes sur iPhone"
          />
          <LinkRow
            href="/settings/health"
            icon={<ActivityIcon />}
            label="Activité depuis Santé"
            hint={bridgeHint}
          >
            <Badge variant={bridgeLabel === 'Actif' ? 'secondary' : 'outline'}>{bridgeLabel}</Badge>
          </LinkRow>
          <li className={ROW}>
            <RowBody icon={<SunMoonIcon />} label="Thème">
              <AppearanceForm initial={appearance} compact />
            </RowBody>
          </li>
        </ul>
      </Card>

      {/*
        Le compte : ce qui protège l'accès (code de secours), ce qui rappelle
        de noter, et ce que le RGPD garantit — emporter ses données et les
        effacer. La suppression reste sous la carte, à part, comme le
        verrouillage : un geste qui ne se rattrape pas ne s'aligne pas avec
        des réglages ordinaires.
      */}
      <h2 className="mt-5 mb-2 text-[12.5px] text-muted-foreground">Compte</h2>
      <Card className="gap-0 overflow-hidden py-0">
        <ul>
          <li className={ROW}>
            <RowBody
              icon={<BellIcon />}
              label="Rappel du déjeuner"
              hint="À 14 h, si rien n'est noté ce midi"
            >
              <ReminderSwitch publicKey={pushPublicKey()} />
            </RowBody>
          </li>
          <li className={ROW}>
            <RowBody
              icon={<KeyRoundIcon />}
              label="Code de secours"
              hint={
                recoveryCode
                  ? 'Actif · permet de changer un mot de passe oublié'
                  : 'Aucun · sans lui, un mot de passe oublié ferme le compte'
              }
            >
              <RecoveryCodeButton exists={recoveryCode} />
            </RowBody>
          </li>
          <li className="border-b last:border-b-0">
            <a
              href="/api/account/export"
              download
              className={cn(ROW, 'border-b-0 transition-colors active:bg-accent')}
            >
              <RowBody
                icon={<DownloadIcon />}
                label="Exporter mes données"
                hint="Journal, pesées, recettes et séances, en JSON"
              />
            </a>
          </li>
        </ul>
      </Card>
      <DeleteAccountButton />

      <h2 className="mt-5 mb-2 text-[12.5px] text-muted-foreground">Table de référence</h2>
      <Card className="gap-0 overflow-hidden py-0">
        <dl>
          <div className={ROW}>
            <RowIcon>
              <DatabaseIcon />
            </RowIcon>
            <dt className="flex-1 text-[14.5px] font-medium tracking-tight">Aliments CIQUAL</dt>
            <dd className="tabular text-muted-foreground">{ciqual.count}</dd>
          </div>
          <div className={cn(ROW, 'pl-[3.75rem]')}>
            <dt className="flex-1 text-[14.5px] font-medium tracking-tight">Dernier import</dt>
            <dd className="tabular text-muted-foreground">{ciqual.lastImport}</dd>
          </div>
        </dl>
      </Card>

      <h2 className="mt-5 mb-2 text-[12.5px] text-muted-foreground">Session</h2>
      <Card className="gap-0 overflow-hidden py-0">
        <div className={ROW}>
          <RowBody
            icon={<LockIcon />}
            label="Verrouiller maintenant"
            hint="Supprime le cookie et redemande le mot de passe"
          />
        </div>
      </Card>
      <LockButton />

      <p className="tabular mt-4 flex justify-between text-[12.5px] text-muted-foreground">
        <span>Version {APP_VERSION}</span>
        <span>CIQUAL · {ciqual.count} aliments</span>
      </p>
    </>
  );
}
