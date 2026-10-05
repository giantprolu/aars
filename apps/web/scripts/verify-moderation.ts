/**
 * Vérification de la modération : fonctions pures et jeu de cas étiqueté.
 * Sans base ni réseau. Lancement : npm run verify:moderation -w @nutri/web
 *
 * Deux parties :
 * 1. des tests unitaires sur chaque étape (normalisation, règles, score,
 *    politique, strikes, confiance, signalements) ;
 * 2. le jeu de cas (`moderation-dataset.ts`) passé dans la chaîne complète,
 *    avec un tableau par classe. Un cas attendu échoue la vérification ; un
 *    cas marqué `known_miss` est compté comme limite connue.
 */
import assert from 'node:assert/strict';
import { POLICY_VERSION, RATE_LIMITS, RISK_MODIFIERS, STRIKE_HALF_LIFE_DAYS } from '../src/lib/moderation/config';
import { normalizeText } from '../src/lib/moderation/normalize';
import { decide, type PolicyContext } from '../src/lib/moderation/policy';
import {
  credibleWeight,
  detectCoordinatedReporting,
  notePriority,
  reportWeight,
  reportsOnlyPriority,
} from '../src/lib/moderation/reports';
import { classifyLocally, detectWithRules } from '../src/lib/moderation/rules';
import { computeRisk, levelOf, reportComponent, type RiskInput } from '../src/lib/moderation/score';
import { cappedStep, decayedWeight, isAutomatable, ladderStep, stepFor, strikeTotal } from '../src/lib/moderation/strikes';
import { trustScore, type TrustFactors } from '../src/lib/moderation/trust';
import type { Detection, TargetKind } from '../src/lib/moderation/types';
import { COORDINATED_CASES, DATASET, type DatasetCase } from './moderation-dataset';

let passed = 0;
function check(name: string, run: () => void): void {
  try {
    run();
    passed += 1;
  } catch (error) {
    console.error(`ÉCHEC ${name}`);
    throw error;
  }
}

const quiet: Omit<RiskInput, 'detections'> = {
  reportWeight: 0,
  coordinated: false,
  strikeTotal: 0,
  recentSameCategory: 0,
  accountAgeDays: 365,
  botSignals: 0,
};

const context = (overrides: Partial<PolicyContext> = {}): PolicyContext => ({
  targetKind: 'template_name',
  preExposure: true,
  scan: false,
  reportReasons: [],
  reportWeight: 0,
  coordinated: false,
  notePriority: null,
  ...overrides,
});

const detection = (overrides: Partial<Detection>): Detection => ({
  source: 'rules',
  category: 'harassment',
  severity: 'high',
  confidence: 0.9,
  signals: [],
  ...overrides,
});

// 1. Normalisation et contournement.

check('caractères invisibles retirés et signalés', () => {
  const text = normalizeText('conn​ard');
  assert.equal(text.folded, 'conard');
  assert.ok(text.signals.includes('zero_width'));
});
check('homoglyphe cyrillique ramené au latin', () => {
  const text = normalizeText('cоnnard'); // « о » cyrillique
  assert.equal(text.folded, 'conard');
  assert.ok(text.signals.includes('homoglyph'));
});
check('leet traduit, nombres seuls intacts', () => {
  assert.equal(normalizeText('c0nn4rd').folded, 'conard');
  assert.equal(normalizeText('38 kg').plain, '38 kg');
});
check('lettres espacées recollées', () => {
  const text = normalizeText('c . o . n . n . a . r . d');
  assert.equal(text.folded, 'conard');
  assert.ok(text.signals.includes('spaced_letters'));
});
check('lettres masquées reconnues', () => {
  const result = detectWithRules('c*nnard', 'identity');
  assert.equal(result.detections[0]?.category, 'harassment');
  assert.ok(result.detections[0]?.signals.includes('evasion'));
});
check('un mot dans un autre ne déclenche pas (Montenegro, pédophilie)', () => {
  assert.equal(classifyLocally('Montenegro', 'identity').detections.length, 0);
  assert.equal(classifyLocally('stop pédophilie', 'identity').detections.length, 0);
});

// 2. Contexte.

check('« te tuer de rire 😂 » est bien moins grave que « te retrouver demain et te tuer »', () => {
  const joke = computeRisk({ ...quiet, detections: classifyLocally('Je vais te tuer de rire 😂', 'template_name').detections });
  const threat = computeRisk({
    ...quiet,
    detections: classifyLocally('Je vais te retrouver demain et te tuer', 'template_name').detections,
  });
  assert.equal(joke.level, 'safe');
  assert.ok(threat.total >= 0.6, `menace crédible à ${threat.total}`);
  assert.ok(threat.dominant?.signals.includes('credible_detail'));
});
check('jargon de salle : « j’ai tué les jambes » ne menace personne', () => {
  assert.equal(classifyLocally('Leg day : j’ai tué les jambes', 'template_name').detections.length, 0);
  const squat = computeRisk({ ...quiet, detections: classifyLocally('Je vais te défoncer au squat', 'template_name').detections });
  assert.equal(squat.level, 'safe');
});
check('l’usurpation ne compte que dans un nom de personne', () => {
  assert.ok(classifyLocally('support aars', 'identity').detections.some((entry) => entry.signals.includes('impersonation')));
  assert.ok(!classifyLocally('support aars', 'template_name').detections.some((entry) => entry.signals.includes('impersonation')));
});

// 3. Score de risque.

check('seuils centralisés', () => {
  assert.equal(levelOf(0), 'safe');
  assert.equal(levelOf(0.2), 'low');
  assert.equal(levelOf(0.59), 'medium');
  assert.equal(levelOf(0.6), 'high');
  assert.equal(levelOf(0.94), 'severe');
  assert.equal(levelOf(0.95), 'critical');
});
check('des signalements seuls, même 1000, restent sous MEDIUM', () => {
  const risk = computeRisk({ ...quiet, detections: [], reportWeight: 1000 });
  assert.ok(risk.total <= RISK_MODIFIERS.reportsCap);
  assert.ok(risk.total < 0.4);
});
check('une vague coordonnée ne compte presque plus', () => {
  assert.ok(reportComponent(20, true) < reportComponent(20, false));
});
check('un historique chargé n’invente pas de risque sur un texte anodin', () => {
  const risk = computeRisk({ ...quiet, detections: [], strikeTotal: 10, recentSameCategory: 10, accountAgeDays: 0, botSignals: 5 });
  assert.equal(risk.total, 0);
});
check('3 infractions en 24 h pèsent plus qu’une infraction isolée', () => {
  const found = [detection({ confidence: 0.75, severity: 'medium' })];
  const once = computeRisk({ ...quiet, detections: found, recentSameCategory: 0 });
  const series = computeRisk({ ...quiet, detections: found, recentSameCategory: 3, strikeTotal: 2 });
  assert.ok(series.total > once.total);
  assert.ok(series.pattern > 0 && series.recidivism > 0);
});
check('le score reste entre 0 et 1', () => {
  const risk = computeRisk({
    ...quiet,
    detections: [detection({ severity: 'critical', confidence: 1, signals: ['evasion'] })],
    reportWeight: 100,
    strikeTotal: 100,
    recentSameCategory: 100,
    accountAgeDays: 0,
    botSignals: 100,
  });
  assert.equal(risk.total, 1);
});

// 4. Politique.

check('signalements seuls : revue humaine, ni masquage ni strike', () => {
  const risk = computeRisk({ ...quiet, detections: [], reportWeight: 50 });
  const decision = decide(risk, context({ reportReasons: ['harassment'], reportWeight: 50 }));
  assert.equal(decision.action, 'content_review');
  assert.equal(decision.hide, false);
  assert.equal(decision.strikeWeight, 0);
  assert.ok(decision.flags.includes('REPORTS_ONLY'));
});
check('mineurs : P0 et masquage au moindre signal, strike seulement sur un signal net', () => {
  const doubtful = decide(
    computeRisk({ ...quiet, detections: [detection({ category: 'minor_safety', severity: 'critical', confidence: 0.6 })] }),
    context(),
  );
  assert.equal(doubtful.priority, 0);
  assert.equal(doubtful.hide, true);
  assert.equal(doubtful.strikeWeight, 0);
  assert.ok(doubtful.flags.includes('CRITICAL_SAFETY'));
  const explicit = decide(
    computeRisk({ ...quiet, detections: [detection({ category: 'minor_safety', severity: 'critical', confidence: 0.95 })] }),
    context({ preExposure: false }),
  );
  assert.ok(explicit.strikeWeight > 0);
  assert.equal(explicit.sanctionFloor, 'long_restriction');
});
check('auto-agression : masquée, jamais de strike, drapeau d’aide', () => {
  const decision = decide(
    computeRisk({ ...quiet, detections: [detection({ category: 'self_harm', severity: 'high', confidence: 0.9 })] }),
    context(),
  );
  assert.equal(decision.hide, true);
  assert.equal(decision.strikeWeight, 0);
  assert.ok(decision.flags.includes('SELF_HARM_SUPPORT'));
});
check('rattrapage : un dossier, rien de masqué ni de sanctionné', () => {
  const decision = decide(computeRisk({ ...quiet, detections: [detection({})] }), context({ scan: true }));
  assert.equal(decision.hide, false);
  assert.equal(decision.review, true);
  assert.equal(decision.strikeWeight, 0);
});
check('refusé avant d’être montré : strike à moitié ; pseudo refusé = contenu retiré', () => {
  const found = [detection({ severity: 'high', confidence: 0.9 })];
  const before = decide(computeRisk({ ...quiet, detections: found }), context({ targetKind: 'user' }));
  const after = decide(computeRisk({ ...quiet, detections: found }), context({ preExposure: false }));
  assert.equal(before.action, 'content_removed');
  assert.equal(after.action, 'content_hidden');
  assert.equal(before.strikeWeight * 2, after.strikeWeight);
});
check('décision déterministe et versionnée', () => {
  const risk = computeRisk({ ...quiet, detections: [detection({})] });
  assert.deepEqual(decide(risk, context()), decide(risk, context()));
  assert.equal(decide(risk, context()).policyVersion, POLICY_VERSION);
});

// 5. Strikes et récidive.

check('un strike perd la moitié de son poids à chaque demi-vie', () => {
  assert.equal(decayedWeight(1, STRIKE_HALF_LIFE_DAYS), 0.5);
  assert.equal(decayedWeight(2, 0), 2);
});
check('un incident d’il y a six mois pèse moins qu’une série récente', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const old = strikeTotal([{ weight: 1, at: new Date('2026-04-06T12:00:00Z'), voided: false }], now);
  const recent = strikeTotal(
    [
      { weight: 1, at: new Date('2026-10-05T12:00:00Z'), voided: false },
      { weight: 1, at: new Date('2026-10-06T10:00:00Z'), voided: false },
    ],
    now,
  );
  assert.ok(old < 0.3 && recent > 1.9);
});
check('un strike annulé en appel ne compte plus', () => {
  assert.equal(strikeTotal([{ weight: 3, at: new Date(), voided: true }], new Date()), 0);
});
check('échelle : avertissement, restrictions, puis suspension et ban proposés', () => {
  assert.equal(ladderStep(0.5), null);
  assert.equal(ladderStep(1)?.action, 'soft_warning');
  assert.equal(ladderStep(2)?.action, 'temporary_restriction');
  assert.equal(ladderStep(3)?.action, 'long_restriction');
  assert.equal(ladderStep(4)?.action, 'account_suspension');
  assert.equal(ladderStep(7)?.action, 'permanent_ban');
});
check('jamais de suspension ni de ban automatiques', () => {
  assert.equal(isAutomatable('account_suspension'), false);
  assert.equal(isAutomatable('permanent_ban'), false);
  const ban = ladderStep(10);
  assert.ok(ban !== null);
  assert.equal(cappedStep(ban)?.action, 'long_restriction');
  assert.equal(stepFor('long_restriction')?.hours, 24 * 7);
});

// 6. Confiance et signalements.

const established: TrustFactors = {
  accountAgeDays: 400,
  hasIdentity: true,
  acceptedFollowers: 8,
  sharedFinishedSessions: 20,
  confirmedReports: 1,
  dismissedReports: 0,
  coordinatedReports: 0,
  strikeTotal: 0,
};

check('score de confiance borné et expliqué facteur par facteur', () => {
  const trust = trustScore(established);
  assert.ok(trust.score > 0.8 && trust.score <= 1);
  const sum = trust.factors.reduce((total, factor) => total + factor.contribution, 0);
  assert.ok(Math.abs(Math.min(1, sum) - trust.score) < 0.01);
  const fresh = trustScore({ ...established, accountAgeDays: 0, hasIdentity: false, acceptedFollowers: 0, sharedFinishedSessions: 0, confirmedReports: 0 });
  assert.ok(fresh.score < trust.score);
  const abusive = trustScore({ ...established, dismissedReports: 10, coordinatedReports: 10, strikeTotal: 10 });
  assert.ok(abusive.score >= 0 && abusive.score < 0.3);
});
check('un compte récent signale à poids réduit', () => {
  assert.ok(reportWeight({ trust: 0.6, accountAgeDays: 1 }) < reportWeight({ trust: 0.6, accountAgeDays: 30 }));
});
check('une personne ne pèse qu’une fois, quel que soit le nombre de ses signalements', () => {
  const spam = Array.from({ length: 1000 }, () => ({ reporterId: 7, weight: 0.9 }));
  assert.equal(credibleWeight(spam), 0.9);
});
check('note de signalement : mineur en P0, menace en P1', () => {
  assert.equal(notePriority('il envoie des messages à une enfant'), 0);
  assert.equal(notePriority('il m’a menacé de mort'), 1);
  assert.equal(notePriority('pseudo ridicule'), null);
});
check('vague coordonnée : priorité P2 pour analyse, pas une preuve', () => {
  assert.equal(reportsOnlyPriority(['spam'], 0.5, true), 2);
});
check('limites de fréquence configurées', () => {
  for (const rule of Object.values(RATE_LIMITS)) {
    assert.ok(rule.limit > 0 && rule.windowSeconds > 0);
  }
});

const now = new Date('2026-10-06T12:00:00Z');
for (const scenario of COORDINATED_CASES) {
  check(`vague : ${scenario.name}`, () => {
    const result = detectCoordinatedReporting(
      scenario.reports.map((report) => ({
        reporterId: report.reporterId,
        reporterAgeDays: report.reporterAgeDays,
        weight: report.weight,
        note: report.note,
        createdAt: new Date(now.getTime() - report.minutesAgo * 60_000),
      })),
      now,
    );
    assert.equal(result.coordinated, scenario.coordinated);
  });
}

// 7. Le jeu de cas, de bout en bout.

function verdict(entry: DatasetCase): 'allow' | 'review' | 'block' {
  const { detections } = classifyLocally(entry.text, entry.field);
  const targetKind: TargetKind = entry.field === 'identity' ? 'user' : entry.field;
  const decision = decide(computeRisk({ ...quiet, detections }), context({ targetKind }));
  return decision.hide ? 'block' : decision.review ? 'review' : 'allow';
}

const byClass = new Map<string, { total: number; ok: number; misses: number }>();
const failures: string[] = [];
const knownMisses: string[] = [];
for (const entry of DATASET) {
  const got = verdict(entry);
  const stats = byClass.get(entry.class) ?? { total: 0, ok: 0, misses: 0 };
  stats.total += 1;
  if (got === entry.expect) {
    stats.ok += 1;
  } else if (entry.known_miss) {
    stats.misses += 1;
    knownMisses.push(`${entry.class} « ${entry.text} » : ${got} au lieu de ${entry.expect}`);
  } else {
    failures.push(`${entry.class} « ${entry.text} » (${entry.field}) : ${got} au lieu de ${entry.expect}`);
  }
  byClass.set(entry.class, stats);
}

console.log('\nJeu de cas, par classe :');
for (const [klass, stats] of byClass) {
  const extra = stats.misses > 0 ? `, ${stats.misses} limite(s) connue(s)` : '';
  console.log(`  ${klass.padEnd(13)} ${stats.ok}/${stats.total}${extra}`);
}
if (knownMisses.length > 0) {
  console.log('\nLimites connues des règles locales :');
  for (const miss of knownMisses) {
    console.log(`  - ${miss}`);
  }
}
if (failures.length > 0) {
  console.error('\nCas en échec :');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`\n${passed} vérifications unitaires et ${DATASET.length} cas : tout passe (politique ${POLICY_VERSION}).`);
