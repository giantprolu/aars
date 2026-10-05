/**
 * Vérification de la modération sur une vraie base Postgres, en mémoire
 * (PGlite), avec toutes les migrations du dépôt. Jamais la base de production.
 *
 *   npm run verify:moderation-db -w @nutri/web
 *
 * De bout en bout : un texte écrit, la détection, l'action, le dossier,
 * l'audit ; puis les attaques contre le système lui-même — faux
 * signalements en meute, rejeu, manipulation du score, accès admin, journal
 * d'audit falsifié.
 */
import assert from 'node:assert/strict';
import { TEST_ADMIN_KEY, pglite } from './db-test/client';
import { migrate } from './db-test/migrate';
import { createUser } from '../src/server/db/queries/users';
import { brokenAuditLinks, insertSanction } from '../src/server/db/queries/moderation';
import { exportUserData } from '../src/server/db/queries/account';
import { feedFor, findPeople, follow, giveKudos, report, saveIdentity, shareSession } from '../src/server/services/social';
import { fullExerciseCatalog, pickableExerciseCatalog, saveWrittenSession } from '../src/server/services/workouts';
import { communityStanding } from '../src/server/moderation/standing';
import { withinLimit } from '../src/server/moderation/rate-limit';
import { purgeModeration } from '../src/server/moderation/retention';
import { RATE_LIMITS } from '../src/lib/moderation/config';
import { adminActor, type AdminActor } from '../src/server/admin';
import { moderationMetrics, moderationQueue } from '../src/server/db/queries/admin';
import { caseView, decideCase, liftSanctionAs } from '../src/server/moderation/decisions';

let passed = 0;
async function check(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    passed += 1;
    console.log(`ok  ${name}`);
  } catch (error) {
    console.error(`ÉCHEC ${name}`);
    throw error;
  }
}

async function one<T>(query: string, params: unknown[] = []): Promise<T> {
  const result = await pglite.query<T>(query, params);
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error(`Aucune ligne : ${query}`);
  }
  return row;
}

async function count(query: string, params: unknown[] = []): Promise<number> {
  return Number((await one<{ n: number }>(query, params)).n);
}

/** Un compte, d'un âge donné, présenté sous ce pseudo (écrit directement : contenu « d'avant »). */
async function account(name: string, ageDays: number, handle: string | null = name, displayName: string | null = null): Promise<number> {
  const created = await createUser(`${name}@example.com`, 'hash');
  if (created.kind !== 'created') {
    throw new Error('Compte non créé');
  }
  await pglite.query(
    `update users set created_at = now() - make_interval(days => $2), handle = $3, display_name = $4 where id = $1`,
    [created.user.id, ageDays, handle, displayName],
  );
  return created.user.id;
}

/** Une séance terminée sur un modèle écrit à la main, encore privée. */
async function finishedSession(userId: number, templateName: string): Promise<{ sessionId: number; templateId: number }> {
  const template = await one<{ id: number }>(
    `insert into workout_templates (user_id, name, kind) values ($1, $2, 'custom') returning id`,
    [userId, templateName],
  );
  const session = await one<{ id: number }>(
    `insert into workout_sessions (user_id, template_id, session_date, started_at, finished_at)
     values ($1, $2, current_date, now() - interval '1 hour', now()) returning id`,
    [userId, template.id],
  );
  return { sessionId: Number(session.id), templateId: Number(template.id) };
}

async function accept(followerId: number, followeeId: number): Promise<void> {
  await pglite.query(`insert into follows (follower_id, followee_id, status) values ($1, $2, 'accepted')`, [followerId, followeeId]);
}

async function main(): Promise<void> {
  await migrate();

  const alice = await account('alice', 200, null);
  const carol = await account('carol', 300);
  const established = [await account('rita', 400), await account('remy', 380), await account('rose', 350)];

  await check('un pseudo insultant est refusé, avec un message, et rien n’est écrit', async () => {
    const result = await saveIdentity(alice, 'connard', null);
    assert.equal(result.kind, 'rejected');
    assert.ok(result.kind === 'rejected' && result.message.includes('règles de la Communauté'));
    assert.equal((await one<{ handle: string | null }>('select handle from users where id = $1', [alice])).handle, null);
  });

  await check('le refus ouvre un dossier, trace l’audit, vaut un demi-strike', async () => {
    const found = await one<{ id: number; status: string; target_kind: string; content_snapshot: string; policy_version: string }>(
      `select id, status, target_kind, content_snapshot, policy_version from moderation_cases where subject_user_id = $1`,
      [alice],
    );
    assert.equal(found.target_kind, 'user');
    assert.equal(found.status, 'triaged');
    assert.equal(found.content_snapshot, 'connard');
    const events = (await pglite.query<{ event: string }>(`select event from moderation_audit where case_id = $1 order by id`, [found.id])).rows.map(
      (row) => row.event,
    );
    assert.deepEqual(events, ['CASE_OPENED', 'MODERATION_DETECTED', 'MODERATION_CLASSIFIED', 'CONTENT_REMOVED', 'STRIKE_RECORDED']);
    assert.equal(await count(`select sum(strike_weight) as n from moderation_sanctions where user_id = $1`, [alice]), 0.5);
  });

  await check('rejouer et déguiser le même refus ne double pas le strike', async () => {
    assert.equal((await saveIdentity(alice, 'connard', null)).kind, 'rejected');
    assert.equal((await saveIdentity(alice, 'c0nn4rd', null)).kind, 'rejected');
    assert.equal(await count(`select count(*) as n from moderation_sanctions where user_id = $1 and strike_weight > 0`, [alice]), 1);
    assert.equal(await count(`select count(*) as n from moderation_cases where subject_user_id = $1`, [alice]), 1);
  });

  await check('un pseudo correct passe sans laisser de trace', async () => {
    const before = await count('select count(*) as n from moderation_audit');
    assert.equal((await saveIdentity(alice, 'alice_fit', 'Alice')).kind, 'saved');
    assert.equal(await count('select count(*) as n from moderation_audit'), before);
  });

  const threat = await finishedSession(alice, 'Je vais te retrouver demain et te tuer');
  await accept(carol, alice);

  await check('menace crédible au partage : nom masqué, partage fait, restriction de 7 jours', async () => {
    const result = await shareSession(alice, threat.sessionId, 'summary');
    assert.equal(result.kind, 'done');
    const template = await one<{ name_hidden_at: Date | null; name_reviewed_at: Date | null }>(
      'select name_hidden_at, name_reviewed_at from workout_templates where id = $1',
      [threat.templateId],
    );
    assert.ok(template.name_hidden_at !== null && template.name_reviewed_at !== null);
    const standing = await communityStanding(alice);
    assert.equal(standing.kind, 'restricted');
    assert.ok(standing.kind === 'restricted' && standing.until !== null);
    const days = standing.kind === 'restricted' && standing.until !== null ? (standing.until.getTime() - Date.now()) / 86_400_000 : 0;
    assert.ok(days > 6.9 && days <= 7, `restriction de ${days} jours`);
    const priority = await count(`select priority as n from moderation_cases where target_kind = 'template_name' and target_id = $1`, [
      threat.templateId,
    ]);
    assert.equal(priority, 1);
  });

  await check('le fil de l’abonné montre « Séance », l’auteur garde son nom', async () => {
    const theirs = await feedFor(carol, null);
    const shared = theirs.sessions.find((session) => session.id === threat.sessionId);
    assert.equal(shared?.name, 'Séance');
    const mine = await feedFor(alice, null);
    assert.equal(mine.sessions.find((session) => session.id === threat.sessionId)?.name, 'Je vais te retrouver demain et te tuer');
  });

  await check('restreinte : plus de suivi, de bravo ni de partage ; le nom reste modifiable', async () => {
    const followed = await follow(alice, established[0] ?? 0);
    assert.equal(followed.kind, 'restricted');
    assert.ok(followed.kind === 'restricted' && followed.message.includes('journal'));
    assert.equal((await giveKudos(alice, threat.sessionId, true)).kind, 'restricted');
    const other = await finishedSession(alice, 'Jambes');
    assert.equal((await shareSession(alice, other.sessionId, 'detailed')).kind, 'restricted');
    assert.equal((await shareSession(alice, threat.sessionId, 'private')).kind, 'done');
    assert.equal((await saveIdentity(alice, 'alice_fit', 'Alice F.')).kind, 'saved');
  });

  const bob = await account('bob', 500);
  const bobSession = await finishedSession(bob, 'Dos');
  await pglite.query(`update workout_sessions set visibility = 'summary' where id = $1`, [bobSession.sessionId]);
  await accept(carol, bob);

  await check('suspendu : invisible de la recherche, du fil, et des demandes de suivi', async () => {
    assert.ok((await findPeople(carol, 'bob')).some((person) => person.id === bob));
    assert.ok((await feedFor(carol, null)).sessions.some((session) => session.id === bobSession.sessionId));
    await insertSanction(bob, {
      caseId: null,
      kind: 'suspension',
      action: 'account_suspension',
      category: 'harassment',
      severity: 'high',
      strikeWeight: 0,
      endsAt: new Date(Date.now() + 86_400_000),
      decidedBy: 'admin:test',
      policyVersion: 'test',
    });
    assert.ok(!(await findPeople(carol, 'bob')).some((person) => person.id === bob));
    assert.ok(!(await feedFor(carol, null)).sessions.some((session) => session.id === bobSession.sessionId));
    assert.equal((await follow(established[1] ?? 0, bob)).kind, 'unavailable');
  });

  const dave = await account('dave', 300, 'dave', 'Dave');
  const brigade: number[] = [];
  for (let index = 0; index < 20; index += 1) {
    brigade.push(await account(`fresh${index}`, 0));
  }

  await check('20 comptes d’un jour signalent la même personne : vague signalée, aucune sanction', async () => {
    for (const reporter of brigade) {
      assert.equal(await report(reporter, { userId: dave, sessionId: null, reason: 'harassment', note: 'Il triche, signalez le !' }), 'created');
    }
    const found = await one<{ flags: string[]; priority: number; status: string }>(
      `select flags, priority, status from moderation_cases where subject_user_id = $1 and target_kind = 'user'`,
      [dave],
    );
    assert.ok(found.flags.includes('COORDINATED_REPORTING'));
    assert.ok(found.flags.includes('REPORTS_ONLY'));
    assert.equal(found.priority, 2);
    assert.equal((await communityStanding(dave)).kind, 'good');
    assert.equal(await count('select count(*) as n from moderation_sanctions where user_id = $1', [dave]), 0);
    assert.equal(await count(`select count(*) as n from moderation_audit where event = 'COORDINATED_REPORTING_FLAGGED' and user_id = $1`, [dave]), 20 - 2);
  });

  await check('un signalement rejoué ne compte pas deux fois', async () => {
    const reporter = brigade[0] ?? 0;
    const before = await count(`select count(*) as n from moderation_audit where event = 'REPORT_CREATED'`);
    // Rejouer répond comme la première fois (les apps réessaient), sans rien refaire.
    assert.equal(await report(reporter, { userId: dave, sessionId: null, reason: 'harassment', note: null }), 'created');
    assert.equal(await count('select count(*) as n from social_reports where reporter_id = $1 and reported_user_id = $2', [reporter, dave]), 1);
    assert.equal(await count(`select count(*) as n from moderation_audit where event = 'REPORT_CREATED'`), before);
  });

  await check('signaler en rafale est borné par compte et par cible', async () => {
    const spammer = await account('spammer', 100);
    const targets: number[] = [];
    for (let index = 0; index < 12; index += 1) {
      targets.push(await account(`victim${index}`, 100));
    }
    const results: string[] = [];
    for (const target of targets) {
      results.push(await report(spammer, { userId: target, sessionId: null, reason: 'spam', note: null }));
    }
    assert.equal(results.filter((result) => result === 'created').length, RATE_LIMITS.reportsPerUser.limit);
    assert.equal(results.filter((result) => result === 'rate_limited').length, 12 - RATE_LIMITS.reportsPerUser.limit);
    assert.ok((await count(`select count(*) as n from moderation_audit where event = 'REPORT_RATE_LIMITED' and user_id = $1`, [spammer])) >= 2);
  });

  const erin = await account('erin', 200, 'erin', 'sale arabe');

  await check('un pseudo d’avant, signalé par des comptes fiables : revue P1, pas de sanction automatique', async () => {
    for (const reporter of established) {
      await report(reporter, { userId: erin, sessionId: null, reason: 'harassment', note: 'pseudo raciste' });
    }
    const found = await one<{ category: string; priority: number; flags: string[] }>(
      `select category, priority, flags from moderation_cases where subject_user_id = $1 and target_kind = 'user'`,
      [erin],
    );
    assert.equal(found.category, 'hate');
    assert.ok(found.priority <= 1);
    assert.ok(!found.flags.includes('COORDINATED_REPORTING'));
    assert.equal(await count('select count(*) as n from moderation_sanctions where user_id = $1', [erin]), 0);
    assert.equal((await one<{ display_name: string }>('select display_name from users where id = $1', [erin])).display_name, 'sale arabe');
  });

  await check('des signalements seuls ne sanctionnent jamais, même nombreux et fiables', async () => {
    const frank = await account('frank', 300, 'frank', 'Frank');
    for (const reporter of [...established, carol]) {
      await report(reporter, { userId: frank, sessionId: null, reason: 'harassment', note: null });
    }
    const found = await one<{ risk_score: string; flags: string[] }>(
      `select risk_score, flags from moderation_cases where subject_user_id = $1`,
      [frank],
    );
    assert.ok(Number(found.risk_score) < 0.4);
    assert.ok(found.flags.includes('REPORTS_ONLY'));
    assert.equal((await communityStanding(frank)).kind, 'good');
  });

  await check('une séance d’avant au nom haineux, signalée : nom masqué et strike entier', async () => {
    const gus = await account('gus', 300);
    const legacy = await finishedSession(gus, 'Mort aux juifs');
    await pglite.query(`update workout_sessions set visibility = 'summary' where id = $1`, [legacy.sessionId]);
    await accept(carol, gus);
    await report(carol, { userId: gus, sessionId: legacy.sessionId, reason: 'inappropriate', note: null });
    const template = await one<{ name_hidden_at: Date | null }>('select name_hidden_at from workout_templates where id = $1', [legacy.templateId]);
    assert.ok(template.name_hidden_at !== null);
    assert.equal(await count(`select sum(strike_weight) as n from moderation_sanctions where user_id = $1`, [gus]), 3);
  });

  await check('un exercice importé au nom injurieux : séance gardée, exercice masqué du catalogue commun', async () => {
    const hugo = await account('hugo', 100);
    const saved = await saveWrittenSession(hugo, '2026-10-05', [
      { exerciseId: null, name: 'Bougnoule press', sets: [{ reps: 10, seconds: null, weightKg: 40, toFailure: false }] },
      { exerciseId: null, name: 'Tirage poitrine prise serrée', sets: [{ reps: 12, seconds: null, weightKg: 50, toFailure: false }] },
    ]);
    assert.equal(saved.kind, 'saved');
    const hidden = await one<{ id: number; hidden_at: Date | null }>(`select id, hidden_at from exercises where name = 'Bougnoule press'`);
    assert.ok(hidden.hidden_at !== null);
    assert.ok(!(await pickableExerciseCatalog()).some((exercise) => exercise.id === Number(hidden.id)));
    assert.ok((await fullExerciseCatalog()).some((exercise) => exercise.id === Number(hidden.id)));
    assert.ok((await pickableExerciseCatalog()).some((exercise) => exercise.name === 'Tirage poitrine prise serrée'));
  });

  // Le tableau de bord : décisions humaines.
  const admin: AdminActor = { name: 'admin:Macbook', role: 'admin' };
  const moderator: AdminActor = { name: 'admin:Stagiaire', role: 'moderator' };
  const caseOf = async (userId: number, kind: string) =>
    one<{ id: number }>(`select id::int as id from moderation_cases where subject_user_id = $1 and target_kind = $2`, [userId, kind]);

  await check('la file est triée par priorité, chaque dossier porte sa version', async () => {
    const queue = await moderationQueue('open');
    assert.ok(queue.length >= 5);
    const priorities = queue.map((entry) => entry.priority);
    assert.deepEqual(priorities, [...priorities].sort((a, b) => a - b));
    assert.ok(queue.every((entry) => !Number.isNaN(Date.parse(entry.version)) && !Number.isNaN(Date.parse(entry.createdAt))));
  });

  await check('le nom de l’appareil passe dans l’audit, nettoyé', async () => {
    const actor = adminActor(new Request('http://x', { headers: { 'x-admin-actor': 'Macbook <script>' } }));
    assert.equal(actor.name, 'admin:Macbook script');
    assert.equal(adminActor(new Request('http://x')).name, 'admin');
    const accented = adminActor(new Request('http://x', { headers: { 'x-admin-actor': encodeURIComponent('iPhone de Léa') } }));
    assert.equal(accented.name, 'admin:iPhone de Léa');
  });

  await check('une décision sur une version périmée est refusée, un double clic aussi', async () => {
    const target = await caseOf(dave, 'user');
    const view = await caseView(admin, target.id);
    assert.ok(view !== null);
    assert.equal((await decideCase(admin, target.id, '2020-01-01T00:00:00+00:00', { action: 'take' })).kind, 'conflict');
    assert.equal((await decideCase(admin, target.id, view.version, { action: 'take' })).kind, 'done');
    assert.equal((await decideCase(admin, target.id, view.version, { action: 'take' })).kind, 'conflict');
    const after = await caseView(admin, target.id);
    assert.equal(after?.status, 'under_review');
    assert.equal(after?.assignedTo, 'admin:Macbook');
  });

  await check('classer sans suite : nom rendu, strike annulé, restriction levée, signalements rejetés', async () => {
    const gusId = (await one<{ id: number }>(`select id::int as id from users where handle = 'gus'`)).id;
    const target = await caseOf(gusId, 'session');
    const view = await caseView(admin, target.id);
    assert.ok(view !== null && view.strikeTotal > 0);
    // Le nom est masqué depuis le signalement ; le classement le rend.
    await pglite.query(`update moderation_cases set target_kind = 'template_name', target_id = (
      select template_id from workout_sessions where id = $1) where id = $2`, [view.targetId, target.id]);
    const fresh = await caseView(admin, target.id);
    assert.equal((await decideCase(admin, target.id, fresh?.version ?? '', { action: 'dismiss', note: 'citation historique' })).kind, 'done');
    const template = await one<{ name_hidden_at: Date | null }>('select name_hidden_at from workout_templates where id = $1', [fresh?.targetId ?? 0]);
    assert.equal(template.name_hidden_at, null);
    const closed = await caseView(admin, target.id);
    assert.equal(closed?.status, 'dismissed');
    assert.equal(closed?.strikeTotal, 0);
    assert.ok(closed?.reportList.every((report) => report.status === 'dismissed'));
    assert.equal((await communityStanding(gusId)).kind, 'good');
    const events = closed?.audit.filter((entry) => entry.actor === 'admin:Macbook').map((entry) => entry.event) ?? [];
    assert.deepEqual(events, ['CASE_DISMISSED', 'REPORT_DISMISSED', 'CONTENT_RESTORED']);
    assert.equal((await decideCase(admin, target.id, closed?.version ?? '', { action: 'take' })).kind, 'invalid');
  });

  await check('confirmer : les signalements comptent pour la confiance de leurs auteurs', async () => {
    const target = await caseOf(erin, 'user');
    const view = await caseView(admin, target.id);
    assert.equal((await decideCase(admin, target.id, view?.version ?? '', { action: 'confirm', note: null })).kind, 'done');
    const confirmed = await count(`select count(*) as n from social_reports where reporter_id = $1 and status = 'action_taken'`, [established[0] ?? 0]);
    assert.equal(confirmed, 1);
  });

  await check('suspendre par décision humaine : invisible, durée bornée, rôle vérifié', async () => {
    const target = await caseOf(dave, 'user');
    let view = await caseView(admin, target.id);
    assert.equal((await decideCase(admin, target.id, view?.version ?? '', { action: 'sanction', sanction: 'suspension', days: 400 })).kind, 'invalid');
    assert.equal((await decideCase(moderator, target.id, view?.version ?? '', { action: 'sanction', sanction: 'ban', days: null })).kind, 'forbidden');
    assert.equal((await decideCase(moderator, target.id, view?.version ?? '', { action: 'sanction', sanction: 'suspension', days: 30 })).kind, 'forbidden');
    assert.equal((await decideCase(admin, target.id, view?.version ?? '', { action: 'sanction', sanction: 'suspension', days: 30 })).kind, 'done');
    assert.equal((await communityStanding(dave)).kind, 'suspended');
    assert.ok(!(await findPeople(carol, 'dave')).some((person) => person.id === dave));
    view = await caseView(admin, target.id);
    const suspension = view?.sanctions.find((entry) => entry.kind === 'suspension' && entry.active);
    assert.equal(suspension?.decidedBy, 'admin:Macbook');
    assert.ok(view?.audit.some((entry) => entry.event === 'ACCOUNT_SUSPENDED' && entry.actor === 'admin:Macbook'));

    assert.equal((await liftSanctionAs(moderator, suspension?.id ?? 0, null, false)).kind, 'forbidden');
    assert.equal((await liftSanctionAs(admin, suspension?.id ?? 0, 'erreur de cible', true)).kind, 'done');
    assert.equal((await liftSanctionAs(admin, suspension?.id ?? 0, null, false)).kind, 'not_found');
    assert.equal((await communityStanding(dave)).kind, 'good');
  });

  await check('réinitialiser une identité : pseudo neutre, nom effacé, tracé', async () => {
    const aliceCase = await caseOf(alice, 'user');
    const view = await caseView(admin, aliceCase.id);
    assert.equal((await decideCase(admin, aliceCase.id, view?.version ?? '', { action: 'reset_identity' })).kind, 'done');
    const identity = await one<{ handle: string; display_name: string | null }>('select handle, display_name from users where id = $1', [alice]);
    assert.equal(identity.handle, `membre_${alice}`);
    assert.equal(identity.display_name, null);
    const fresh = await caseView(admin, aliceCase.id);
    assert.equal((await decideCase(admin, aliceCase.id, fresh?.version ?? '', { action: 'hide' })).kind, 'invalid');
  });

  await check('un rôle sans droit ne voit pas le texte en cause', async () => {
    const aliceCase = await caseOf(alice, 'user');
    const reader = await caseView({ name: 'x', role: 'trusted_user' }, aliceCase.id);
    assert.equal(reader?.contentSnapshot, null);
    assert.deepEqual(reader?.allowed, []);
    // Le texte gardé est celui de la tentative la plus grave (déguisée, en récidive).
    assert.equal((await caseView(admin, aliceCase.id))?.contentSnapshot, 'c0nn4rd');
  });

  await check('indicateurs : décisions, faux positifs, sanctions par origine', async () => {
    const metrics = await moderationMetrics(30);
    assert.ok(metrics.opened >= 5);
    assert.equal(metrics.dismissed, 1);
    assert.equal(metrics.confirmed, 1);
    assert.equal(metrics.autoReversed, 1);
    assert.ok(metrics.autoActions >= 3);
    assert.ok(metrics.reports.coordinated >= 1 && metrics.reports.rateLimited >= 1);
    assert.ok(metrics.sanctions.some((entry) => entry.kind === 'suspension' && entry.human >= 1));
    assert.ok(metrics.sanctions.some((entry) => entry.kind === 'restriction' && entry.system >= 1));
  });

  await check('le journal d’audit refuse modification, suppression récente et vidage', async () => {
    await assert.rejects(pglite.query(`update moderation_audit set actor = 'x' where id = 1`), /ajout seul/);
    await assert.rejects(pglite.query(`delete from moderation_audit where id = 1`), /ajout seul/);
    await assert.rejects(pglite.query(`truncate moderation_audit`), /ajout seul/);
    assert.deepEqual(await brokenAuditLinks(), []);
  });

  await check('une ligne d’audit falsifiée en contournant les déclencheurs se voit', async () => {
    await pglite.query('alter table moderation_audit disable trigger moderation_audit_guard');
    await pglite.query(`update moderation_audit set details = '{"forged": true}'::jsonb where id = 3`);
    // La ligne modifiée ne correspond plus à son empreinte.
    assert.deepEqual(await brokenAuditLinks(), [3]);
    // Un faussaire qui recalcule aussi l'empreinte casse le lien avec la ligne suivante.
    await pglite.query(`update moderation_audit set hash = encode(sha256(convert_to(concat_ws('|',
      coalesce(prev_hash, ''), id::text, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
      actor, event, coalesce(case_id::text, ''), coalesce(user_id::text, ''), details::text), 'UTF8')), 'hex') where id = 3`);
    await pglite.query('alter table moderation_audit enable trigger moderation_audit_guard');
    assert.deepEqual(await brokenAuditLinks(), [4]);
  });

  await check('les routes admin restent fermées sans la bonne clé', async () => {
    const { isAdminRequest } = await import('../src/server/admin');
    const withKey = (key: string) => new Request('http://x/api/admin/reports', { headers: { 'x-admin-key': key } });
    assert.equal(isAdminRequest(new Request('http://x/api/admin/reports')), false);
    assert.equal(isAdminRequest(withKey(TEST_ADMIN_KEY.slice(0, -1))), false);
    assert.equal(isAdminRequest(withKey(`${TEST_ADMIN_KEY}x`)), false);
    assert.equal(isAdminRequest(withKey(TEST_ADMIN_KEY)), true);
  });

  await check('limite d’inscriptions par empreinte d’adresse', async () => {
    const results: boolean[] = [];
    for (let index = 0; index < RATE_LIMITS.signupsPerIpHour.limit + 2; index += 1) {
      results.push(await withinLimit('signup:ip:test:h', RATE_LIMITS.signupsPerIpHour));
    }
    assert.equal(results.filter(Boolean).length, RATE_LIMITS.signupsPerIpHour.limit);
  });

  await check('la purge de conservation tourne et n’efface pas un audit récent', async () => {
    const before = await count('select count(*) as n from moderation_audit');
    await purgeModeration();
    assert.ok((await count('select count(*) as n from moderation_audit')) >= before);
  });

  await check('l’export rend ses propres sanctions, sans le dossier des autres', async () => {
    const exported = await exportUserData(alice);
    const moderation = exported.community.moderation;
    assert.ok(moderation.some((entry) => entry.kind === 'restriction'));
    assert.ok(!JSON.stringify(exported).includes('Il triche'));
  });

  console.log(`\n${passed} vérifications sur base en mémoire : tout passe.`);
}

main()
  .then(async () => {
    await pglite.close();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await pglite.close();
    process.exit(1);
  });
