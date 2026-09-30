import { ChevronRightIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { NavHeader, PageTitle } from '@/components/ScreenHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { requireUserId } from '@/server/guard';
import { feedFor, identityFor, pendingRequestCount } from '@/server/services/social';
import { Feed } from './Feed';
import { IdentityForm } from './IdentityForm';

export const dynamic = 'force-dynamic';

/**
 * La communauté : le fil des séances partagées, et l'accès aux abonnements.
 *
 * Composant serveur, aucun import client (AD-10). Tant qu'on ne s'est pas
 * présenté, l'écran commence par là : sans identifiant, personne ne peut
 * vous trouver, et vous ne pouvez suivre personne.
 */
export default async function CommunityPage() {
  const userId = await requireUserId();
  const [identity, pending, feed] = await Promise.all([
    identityFor(userId),
    pendingRequestCount(userId),
    feedFor(userId, null),
  ]);

  return (
    <>
      <NavHeader label="Sport" href="/training" />
      <PageTitle
        title="Communauté"
        description="Les séances de ceux que tu suis, et celles que tu partages."
      />

      {identity.handle === null ? (
        <Card className="mt-5">
          <CardContent>
            <p className="text-[15px] font-semibold tracking-tight">Présente-toi</p>
            <p className="mt-1 mb-4 text-[13px] text-muted-foreground">
              Choisis un identifiant pour qu’on puisse te trouver et que tu puisses suivre
              d’autres personnes. Tes séances restent privées tant que tu ne les partages pas,
              une par une.
            </p>
            <IdentityForm initialHandle={null} initialDisplayName={null} submitLabel="Continuer" />
          </CardContent>
        </Card>
      ) : (
        <Card asChild className="mt-5 flex-row items-center gap-3 px-4 py-3 transition-colors active:bg-accent">
          <Link href="/training/community/people">
            <span
              aria-hidden
              className="flex size-8 flex-none items-center justify-center rounded-lg bg-muted"
            >
              <UsersIcon className="size-[17px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-medium tracking-tight">
                Abonnements
              </span>
              <span className="mt-px block truncate text-[12.5px] text-muted-foreground">
                @{identity.handle} · chercher, suivre, répondre aux demandes
              </span>
            </span>
            {pending > 0 ? (
              <Badge className="tabular" aria-label={`${pending} demandes en attente`}>
                {pending}
              </Badge>
            ) : null}
            <ChevronRightIcon aria-hidden className="size-4 flex-none text-muted-foreground" />
          </Link>
        </Card>
      )}

      <h2 className="mt-6 mb-2 text-[12.5px] text-muted-foreground">Le fil</h2>
      <Feed initial={feed.sessions} initialNext={feed.next} />
    </>
  );
}
