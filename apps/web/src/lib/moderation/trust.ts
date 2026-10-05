/**
 * Le score de confiance interne d'un compte, de 0 à 1. Jamais montré, ni à la
 * personne ni aux autres, et jamais suffisant pour sanctionner.
 *
 * Il ne sert qu'à pondérer les signalements que ce compte fait et à ordonner
 * la file. Chaque facteur est rendu avec sa contribution, pour qu'un
 * modérateur puisse toujours dire pourquoi un compte pèse ce qu'il pèse :
 * un score qu'on ne sait pas expliquer finit par discriminer sans le dire.
 * Le détail des facteurs est dans `docs/MODERATION.md`.
 */

import { TRUST_WEIGHTS as W } from './config';
import { unit } from './types';

export interface TrustFactors {
  accountAgeDays: number;
  hasIdentity: boolean;
  acceptedFollowers: number;
  sharedFinishedSessions: number;
  /** Ses signalements qui ont mené à une action. */
  confirmedReports: number;
  /** Ses signalements rejetés. */
  dismissedReports: number;
  /** Ses signalements pris dans une vague coordonnée. */
  coordinatedReports: number;
  /** Ses strikes amortis. */
  strikeTotal: number;
}

export interface TrustScore {
  score: number;
  factors: { name: keyof TrustFactors | 'base'; contribution: number }[];
}

function ratio(value: number, full: number): number {
  return Math.min(1, Math.max(0, value) / full);
}

export function trustScore(factors: TrustFactors): TrustScore {
  const contributions: TrustScore['factors'] = [
    { name: 'base', contribution: W.base },
    { name: 'accountAgeDays', contribution: W.age * ratio(factors.accountAgeDays, W.ageFullDays) },
    { name: 'hasIdentity', contribution: factors.hasIdentity ? W.identity : 0 },
    { name: 'acceptedFollowers', contribution: W.followers * ratio(factors.acceptedFollowers, W.followersFull) },
    { name: 'sharedFinishedSessions', contribution: W.sessions * ratio(factors.sharedFinishedSessions, W.sessionsFull) },
    {
      name: 'confirmedReports',
      contribution: Math.min(W.confirmedReportCap, W.confirmedReport * Math.max(0, factors.confirmedReports)),
    },
    {
      name: 'dismissedReports',
      contribution: Math.max(W.dismissedReportCap, W.dismissedReport * Math.max(0, factors.dismissedReports)),
    },
    {
      name: 'coordinatedReports',
      contribution: Math.max(W.coordinatedReportCap, W.coordinatedReport * Math.max(0, factors.coordinatedReports)),
    },
    { name: 'strikeTotal', contribution: Math.max(W.strikeCap, W.strike * Math.max(0, factors.strikeTotal)) },
  ];
  const score = unit(contributions.reduce((sum, factor) => sum + factor.contribution, 0));
  return {
    score,
    factors: contributions.map((factor) => ({ ...factor, contribution: Math.round(factor.contribution * 1000) / 1000 })),
  };
}
