import { NavHeader, PageTitle } from '@/components/ScreenHeader';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { requireUserId } from '@/server/guard';
import { identityFor, relationsFor } from '@/server/services/social';
import { IdentityForm } from '../IdentityForm';
import { PeopleManager } from './PeopleManager';

export const dynamic = 'force-dynamic';

/**
 * Qui je suis, qui je suis, qui me suit.
 *
 * Composant serveur, aucun import client (AD-10). Les demandes reçues passent
 * en tête : ce sont les seules qui attendent quelque chose de moi.
 */
export default async function PeoplePage() {
  const userId = await requireUserId();
  const [identity, relations] = await Promise.all([identityFor(userId), relationsFor(userId)]);

  return (
    <>
      <NavHeader label="Communauté" href="/training/community" />
      <PageTitle title="Abonnements" />

      {identity.handle === null ? (
        <div className="mt-5">
          <IdentityForm initialHandle={null} initialDisplayName={null} submitLabel="Continuer" />
        </div>
      ) : (
        <PeopleManager
          requests={relations.requests}
          following={relations.following}
          followers={relations.followers}
        />
      )}

      {identity.handle === null ? null : (
        <Accordion type="single" collapsible className="mt-8 rounded-xl border px-4">
          <AccordionItem value="identity" className="border-b-0">
            <AccordionTrigger className="text-[14px]">Mon identifiant</AccordionTrigger>
            <AccordionContent>
              <IdentityForm
                initialHandle={identity.handle}
                initialDisplayName={identity.displayName}
                submitLabel="Enregistrer"
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </>
  );
}
