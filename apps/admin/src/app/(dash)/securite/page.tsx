import { PageTitle } from '@/components/PageTitle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listPasskeys } from '@/lib/auth';
import { AddPasskey, RevokeButton, SignOutButton } from './SecurityPanel';

export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' });

export default async function SecurityPage() {
  const { passkeys } = await listPasskeys();
  return (
    <>
      <PageTitle title="Sécurité" description="Entrée en deux facteurs : le mot de passe admin, puis une passkey. Session de 8 heures.">
        <SignOutButton />
      </PageTitle>
      <Card>
        <CardHeader>
          <CardTitle>Passkeys</CardTitle>
          <CardDescription>
            Une par appareil. Révoque celle d&apos;un appareil perdu ; la dernière reste, sans quoi plus personne n&apos;entrerait.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 px-0 sm:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Appareil</TableHead>
                <TableHead className="hidden sm:table-cell">Ajoutée</TableHead>
                <TableHead>Dernière utilisation</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {passkeys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.name}</TableCell>
                  <TableCell className="hidden sm:table-cell">{dateFormat.format(new Date(key.createdAt))}</TableCell>
                  <TableCell>{key.lastUsedAt ? dateFormat.format(new Date(key.lastUsedAt)) : 'jamais'}</TableCell>
                  <TableCell className="text-right">
                    <RevokeButton id={key.id} name={key.name} last={passkeys.length <= 1} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="px-4 sm:px-0">
            <AddPasskey />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Changer le mot de passe</CardTitle>
          <CardDescription>
            Modifie <code>ADMIN_PASSWORD</code> dans Vercel puis redéploie : toutes les sessions ouvertes se ferment aussitôt.
          </CardDescription>
        </CardHeader>
      </Card>
    </>
  );
}
