import type { Metadata } from 'next';
import { env } from '@/server/env';
import { Contact, LegalPage } from '../LegalPage';

export const metadata: Metadata = { title: 'Mentions légales · Aars' };

/** « 12345678900012 » devient « 123 456 789 00012 » : le SIREN par groupes de trois, puis le NIC. */
function formatSiret(siret: string): string {
  return `${siret.slice(0, 3)} ${siret.slice(3, 6)} ${siret.slice(6, 9)} ${siret.slice(9)}`;
}

/**
 * Mentions légales (loi pour la confiance dans l'économie numérique, art. 6) :
 * qui édite l'application, qui l'héberge, d'où viennent les données de
 * référence. Publique comme le reste de `/legal`, liée depuis la connexion,
 * les réglages de la PWA et Compte et données des deux apps.
 *
 * L'identité de l'éditeur vient des variables `LEGAL_PUBLISHER_*`
 * (`server/env.ts`). Les hébergeurs ne changent qu'avec un sous-traitant, à
 * reporter alors aussi dans la politique de confidentialité.
 */
export default function LegalNoticePage() {
  const publisher = env.legalPublisher;
  const contact = env.legalContactEmail;
  return (
    <LegalPage title="Mentions légales" updated="7 octobre 2026">
      <h2>Éditeur</h2>
      {publisher === null ? (
        <p>
          Aars (site, API et applications Android et iOS). Pour joindre l&apos;éditeur :{' '}
          <Contact email={contact} />.
        </p>
      ) : (
        <>
          <p>
            Aars (site, API et applications Android et iOS) est édité par {publisher.name},
            entrepreneur individuel.
          </p>
          <ul>
            <li>Adresse : {publisher.address}</li>
            <li>
              SIRET : {formatSiret(publisher.siret)}, immatriculé au registre national des
              entreprises
            </li>
            {publisher.phone === undefined ? null : (
              <li>
                Téléphone :{' '}
                <a href={`tel:${publisher.phone.replace(/[^\d+]/g, '')}`}>{publisher.phone}</a>
              </li>
            )}
            {contact === undefined ? null : (
              <li>
                Courriel : <Contact email={contact} />
              </li>
            )}
          </ul>
          <p>Directeur de la publication : {publisher.name}.</p>
        </>
      )}

      <h2>Hébergement</h2>
      <ul>
        <li>
          Site, API et photos : Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723,
          États-Unis, +1 951 383 6898.
        </li>
        <li>
          Base de données : Neon, Inc., 2128 Sand Hill Road, Menlo Park, CA 94025, États-Unis.
        </li>
      </ul>

      <h2>Signaler un contenu</h2>
      <p>
        Un pseudonyme, un nom ou une séance partagée dans la Communauté te semble illicite ou
        contraire aux règles : touche « … » sur la séance ou sur la personne, puis Signaler.
        {contact === undefined ? null : (
          <>
            {' '}
            Tu peux aussi écrire à <Contact email={contact} />.
          </>
        )}
      </p>

      <h2>Données de référence</h2>
      <ul>
        <li>
          Table de composition nutritionnelle Ciqual, Anses, publiée sous Licence Ouverte
          (Etalab).
        </li>
        <li>
          Produits du commerce : Open Food Facts, base ouverte sous licence ODbL, © les
          contributeurs d&apos;Open Food Facts.
        </li>
        <li>Illustrations des exercices : free-exercise-db, domaine public.</li>
      </ul>

      <h2>Données personnelles</h2>
      <p>
        Ce que l&apos;application conserve, pourquoi et comment l&apos;effacer : voir{' '}
        <a href="/legal/privacy">la politique de confidentialité</a>.
      </p>
    </LegalPage>
  );
}
