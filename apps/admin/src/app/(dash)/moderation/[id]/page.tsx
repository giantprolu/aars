import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon, CheckIcon, EyeIcon, EyeOffIcon, HandIcon, RotateCcwIcon, UserXIcon, XIcon } from 'lucide-react';
import { CaseBadges, PriorityBadge } from '@/components/ModerationBadges';
import { PageTitle } from '@/components/PageTitle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiError, apiGet } from '@/lib/api';
import {
  ACTION_LABELS,
  AUDIT_LABELS,
  CATEGORY_LABELS,
  REASON_LABELS,
  SANCTION_LABELS,
  TARGET_LABELS,
  type CaseView,
} from '@/lib/types';
import { decide, lift } from '../actions';

export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' });
const OPEN = ['open', 'triaged', 'under_review', 'appealed'];

function when(iso: string | null): string {
  return iso === null ? '—' : dateFormat.format(new Date(iso));
}

/** Un geste : un petit formulaire, la version du dossier jointe. */
function Gesture({
  view,
  action,
  label,
  icon,
  variant = 'outline',
  extra,
}: {
  view: CaseView;
  action: string;
  label: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'outline' | 'destructive' | 'secondary';
  extra?: Record<string, string>;
}) {
  return (
    <form action={decide}>
      <input type="hidden" name="id" value={view.id} />
      <input type="hidden" name="version" value={view.version} />
      <input type="hidden" name="action" value={action} />
      {Object.entries(extra ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" size="sm" variant={variant}>
        {icon}
        {label}
      </Button>
    </form>
  );
}

/** Le détail d'un événement d'audit, lisible : des clés et des valeurs, jamais de texte d'utilisateur. */
function details(entry: Record<string, unknown>): string {
  return Object.entries(entry)
    .filter(([, value]) => value !== null && !(Array.isArray(value) && value.length === 0))
    .map(([key, value]) => `${key} : ${Array.isArray(value) ? value.join(', ') : String(value)}`)
    .join(' · ');
}

export default async function CasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string; ok?: string }>;
}) {
  const id = Number((await params).id);
  const { message, ok } = await searchParams;
  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }
  let view: CaseView;
  try {
    view = await apiGet<CaseView>(`/moderation/cases/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const isOpen = OPEN.includes(view.status);
  const may = (permission: string) => view.allowed.includes(permission);
  const critical = view.flags.includes('CRITICAL_SAFETY');
  const breakdown = (view.explanation.breakdown ?? {}) as Record<string, number>;
  const hideable = view.targetKind === 'template_name' || view.targetKind === 'exercise_name' || view.targetKind === 'session';

  return (
    <>
      <Link href="/moderation" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden />
        File de modération
      </Link>
      <PageTitle
        title={`Dossier n° ${view.id}`}
        description={`${TARGET_LABELS[view.targetKind] ?? view.targetKind} · ouvert le ${when(view.createdAt)} · politique ${view.policyVersion}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={view.priority} />
          <CaseBadges status={view.status} category={view.category} flags={view.flags} />
        </div>
      </PageTitle>

      {message ? (
        <Alert variant={ok === '1' ? 'default' : 'destructive'}>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>En cause</CardTitle>
            <CardDescription>
              {view.target.hidden ? 'Masqué aux autres en ce moment.' : 'Visible des autres en ce moment.'}
              {view.target.visibility ? ` Séance ${view.target.visibility === 'private' ? 'privée' : 'partagée'}.` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {view.contentSnapshot === null ? (
              <p className="text-muted-foreground">Texte non conservé, ou non visible pour ce rôle.</p>
            ) : critical ? (
              // Le plus sensible ne s'affiche pas sans le demander.
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-muted-foreground">Afficher le texte (sécurité critique)</summary>
                <p className="mt-2 break-words">{view.contentSnapshot}</p>
              </details>
            ) : (
              <p className="rounded-md bg-muted p-3 break-words">{view.contentSnapshot}</p>
            )}
            {view.target.label && view.target.label !== view.contentSnapshot ? (
              <p className="text-muted-foreground">Aujourd&apos;hui : {view.target.label}</p>
            ) : null}
            {view.resolution ? <p>Issue : {view.resolution}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              @{view.subject.handle ?? '?'} {view.subject.displayName ? `· ${view.subject.displayName}` : ''}
            </CardTitle>
            <CardDescription>
              Compte {view.subject.id}, inscrit le {when(view.subjectSince)} · strikes amortis : {view.strikeTotal}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {view.sanctions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune sanction.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sanction</TableHead>
                    <TableHead>Par</TableHead>
                    <TableHead>Jusqu&apos;au</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.sanctions.map((sanction) => (
                    <TableRow key={sanction.id}>
                      <TableCell>
                        {SANCTION_LABELS[sanction.kind] ?? sanction.kind}
                        {sanction.strikeWeight > 0 ? ` ${sanction.strikeWeight}` : ''}
                        {sanction.caseId === view.id ? '' : ` (dossier ${sanction.caseId ?? '—'})`}
                        {sanction.active ? <Badge className="ml-2">en cours</Badge> : null}
                        {sanction.voided ? <Badge variant="outline" className="ml-2">annulé</Badge> : null}
                        {sanction.liftedAt && !sanction.voided ? <Badge variant="outline" className="ml-2">levée</Badge> : null}
                      </TableCell>
                      <TableCell className="text-xs">{sanction.decidedBy}</TableCell>
                      <TableCell className="text-xs">{sanction.kind === 'strike' ? '—' : when(sanction.endsAt)}</TableCell>
                      <TableCell>
                        {may('sanction.lift') && sanction.liftedAt === null && (sanction.active || sanction.strikeWeight > 0) ? (
                          <form action={lift}>
                            <input type="hidden" name="caseId" value={view.id} />
                            <input type="hidden" name="sanctionId" value={sanction.id} />
                            <input type="hidden" name="void" value={sanction.strikeWeight > 0 ? '1' : '0'} />
                            <Button type="submit" size="sm" variant="ghost">
                              <RotateCcwIcon aria-hidden />
                              {sanction.strikeWeight > 0 ? 'Annuler' : 'Lever'}
                            </Button>
                          </form>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {isOpen && may('case.decide') ? (
        <Card>
          <CardHeader>
            <CardTitle>Décider</CardTitle>
            <CardDescription>
              {view.recommendedAction
                ? `L'automatique propose : ${ACTION_LABELS[view.recommendedAction] ?? view.recommendedAction}. Elle ne s'applique qu'ici, par toi.`
                : 'Classer sans suite rétablit le contenu, annule les strikes et lève ce que l’automatique a posé.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {view.status !== 'under_review' ? <Gesture view={view} action="take" label="Prendre en charge" icon={<HandIcon aria-hidden />} /> : null}
              {hideable && !view.target.hidden && view.target.visibility !== 'private' ? (
                <Gesture view={view} action="hide" label="Masquer" icon={<EyeOffIcon aria-hidden />} />
              ) : null}
              {hideable && view.target.hidden && view.targetKind !== 'session' ? (
                <Gesture view={view} action="restore" label="Rétablir" icon={<EyeIcon aria-hidden />} />
              ) : null}
              {view.targetKind === 'user' && may('sanction.suspend') ? (
                <Gesture view={view} action="reset_identity" label="Réinitialiser l'identité" icon={<UserXIcon aria-hidden />} />
              ) : null}
            </div>

            {may('sanction.restrict') ? (
              <div className="flex flex-wrap gap-2">
                <Gesture view={view} action="sanction" label="Avertir" extra={{ sanction: 'warning' }} variant="secondary" />
                <Gesture view={view} action="sanction" label="Restreindre 1 jour" extra={{ sanction: 'restriction', days: '1' }} variant="secondary" />
                <Gesture view={view} action="sanction" label="Restreindre 7 jours" extra={{ sanction: 'restriction', days: '7' }} variant="secondary" />
                {may('sanction.suspend') ? (
                  <Gesture
                    view={view}
                    action="sanction"
                    label="Suspendre 30 jours"
                    extra={{ sanction: 'suspension', days: '30' }}
                    variant={view.recommendedAction === 'account_suspension' ? 'destructive' : 'secondary'}
                  />
                ) : null}
                {may('sanction.ban') ? (
                  <Gesture
                    view={view}
                    action="sanction"
                    label="Bannir de la Communauté"
                    extra={{ sanction: 'ban' }}
                    variant={view.recommendedAction === 'permanent_ban' ? 'destructive' : 'secondary'}
                  />
                ) : null}
              </div>
            ) : null}

            <form action={decide} className="flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="id" value={view.id} />
              <input type="hidden" name="version" value={view.version} />
              <Input name="note" maxLength={500} placeholder="Note de décision (facultative, reste dans le dossier)" />
              <div className="flex gap-2">
                <Button type="submit" name="action" value="confirm" size="sm">
                  <CheckIcon aria-hidden />
                  Confirmer et clore
                </Button>
                <Button type="submit" name="action" value="dismiss" size="sm" variant="outline">
                  <XIcon aria-hidden />
                  Classer sans suite
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pourquoi</CardTitle>
            <CardDescription>
              {String(view.explanation.policy ?? '—')} · {view.category ? (CATEGORY_LABELS[view.category] ?? view.category) : 'sans catégorie'}{' '}
              · gravité {view.severity ?? '—'} · score {view.riskScore} ({view.level})
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="text-muted-foreground">
              Contenu {breakdown.content ?? 0} · récidive {breakdown.recidivism ?? 0} · série {breakdown.pattern ?? 0} · contournement{' '}
              {breakdown.evasion ?? 0} · compte récent {breakdown.newAccount ?? 0} · signalements {breakdown.reports ?? 0}
            </p>
            {view.signals.length === 0 ? (
              <p className="text-muted-foreground">Aucune détection : dossier ouvert par des signalements.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Confiance</TableHead>
                    <TableHead>Signaux</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.signals.map((signal, index) => (
                    <TableRow key={index}>
                      <TableCell>{signal.source}</TableCell>
                      <TableCell>{signal.category ? (CATEGORY_LABELS[signal.category] ?? signal.category) : '—'}</TableCell>
                      <TableCell className="tabular-nums">{signal.confidence}</TableCell>
                      <TableCell className="text-xs whitespace-normal">{signal.signals.join(', ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Signalements</CardTitle>
            <CardDescription>Le poids dit la confiance accordée à qui signale, pas la gravité.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {view.reportList.length === 0 ? (
              <p className="text-muted-foreground">Aucun signalement.</p>
            ) : (
              view.reportList.map((report) => (
                <div key={report.id} className="flex flex-col gap-1 border-b pb-2 last:border-b-0">
                  <p>
                    {REASON_LABELS[report.reason] ?? report.reason} · par @{report.reporterHandle ?? '?'} (compte {report.reporterId},{' '}
                    {report.reporterAgeDays} j) · poids {report.weight ?? '—'}
                  </p>
                  {report.note ? <p className="rounded-md bg-muted p-2">{report.note}</p> : null}
                  <p className="text-xs text-muted-foreground">{when(report.createdAt)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historique</CardTitle>
          <CardDescription>Journal d&apos;audit du dossier, en ajout seul.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {view.audit.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs whitespace-nowrap">{when(entry.at)}</TableCell>
                  <TableCell className="text-xs">{entry.actor}</TableCell>
                  <TableCell>{AUDIT_LABELS[entry.event] ?? entry.event}</TableCell>
                  <TableCell className="text-xs whitespace-normal text-muted-foreground">{details(entry.details)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
