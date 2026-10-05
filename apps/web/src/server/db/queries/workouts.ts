import 'server-only';
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../client';
import {
  isEquipmentPreference,
  isExerciseEquipment,
  isExerciseKind,
  isExerciseRegion,
  isTemplateKind,
  isTrainingFocus,
  type Exercise,
  type Gym,
  type TemplateExercise,
  type TemplateKind,
  type TrainingPreferences,
  type WorkoutSession,
  type WorkoutSet,
  type WorkoutTemplate,
} from '@/lib/workout';
import type { ProgressExercise, ProgressSet } from '@/lib/workout-progress';
import type { SeedExercise } from '@/lib/workout-seed';
import { isSessionVisibility } from '@/lib/social';

/**
 * Accès aux séances.
 *
 * Les exercices forment un référentiel commun, sans utilisateur, comme CIQUAL.
 * Tout le reste — modèles, séances, séries — porte l'utilisateur en premier
 * argument et ne le déduit jamais : un programme d'entraînement dit ce qu'on
 * soulève et à quelle fréquence, c'est une donnée personnelle.
 */

function toNullableNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function toExercise(row: typeof schema.exercises.$inferSelect): Exercise {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    // La contrainte en base garantit déjà la valeur ; le repli évite un
    // transtypage muet sur une ligne écrite par une version antérieure.
    kind: isExerciseKind(row.kind) ? row.kind : 'strength',
    muscleGroup: row.muscleGroup,
    region: isExerciseRegion(row.region) ? row.region : 'upper',
    equipment: isExerciseEquipment(row.equipment) ? row.equipment : 'machine',
    rank: row.rank,
    aliases: row.aliases,
  };
}

/**
 * Insère les exercices du catalogue livré, sans toucher à ceux qui existent.
 *
 * Idempotent sur le `slug` : relancer n'écrase rien d'autre que les colonnes
 * de classement. Le nom, lui, est préservé — un utilisateur a pu le changer, et
 * le seed n'a pas à défaire ce choix. Le matériel, la région et le rang sont
 * en revanche réécrits : ce sont des propriétés du mouvement, pas des
 * préférences, et une version qui les corrige doit pouvoir les corriger.
 */
export async function ensureSeedExercises(seed: readonly SeedExercise[]): Promise<void> {
  if (seed.length === 0) {
    return;
  }
  await db()
    .insert(schema.exercises)
    .values(
      seed.map((exercise) => ({
        slug: exercise.slug,
        name: exercise.name,
        kind: exercise.kind,
        muscleGroup: exercise.muscleGroup,
        region: exercise.region,
        equipment: exercise.equipment,
        rank: exercise.rank,
        aliases: [...exercise.aliases],
        source: 'seed',
      })),
    )
    .onConflictDoUpdate({
      target: schema.exercises.slug,
      set: {
        muscleGroup: sql`excluded.muscle_group`,
        region: sql`excluded.region`,
        equipment: sql`excluded.equipment`,
        rank: sql`excluded.rank`,
        aliases: sql`excluded.aliases`,
      },
    });
}

/**
 * Le catalogue, restreint à une salle si l'on en a choisi une.
 *
 * `gymId` à `null` rend tout le catalogue : ne pas savoir où l'on s'entraîne
 * doit ouvrir les possibilités, pas les fermer.
 */
export async function listExercises(
  gymId: number | null,
  options: { includeHidden: boolean } = { includeHidden: false },
): Promise<Exercise[]> {
  // Un exercice masqué par la modération ne se propose plus à personne ; il
  // reste lisible là où il nomme une séance déjà faite (`includeHidden`).
  const visible = options.includeHidden ? undefined : isNull(schema.exercises.hiddenAt);
  if (gymId === null) {
    const rows = await db().select().from(schema.exercises).where(visible).orderBy(asc(schema.exercises.name));
    return rows.map(toExercise);
  }

  const rows = await db()
    .select({ exercise: schema.exercises })
    .from(schema.exercises)
    .innerJoin(
      schema.gymExercises,
      eq(schema.gymExercises.exerciseId, schema.exercises.id),
    )
    .where(and(eq(schema.gymExercises.gymId, gymId), visible))
    .orderBy(asc(schema.exercises.name));
  return rows.map((row) => toExercise(row.exercise));
}

/**
 * Insère les salles et leur inventaire.
 *
 * L'inventaire est réécrit à chaque passage, contrairement au catalogue : il
 * n'est le fruit d'aucun choix de l'utilisateur, et une version qui corrige la
 * liste des machines d'une enseigne doit pouvoir la corriger.
 */
export async function ensureSeedGyms(
  seed: readonly { slug: string; name: string; note: string; exerciseSlugs: readonly string[] }[],
): Promise<void> {
  if (seed.length === 0) {
    return;
  }

  await db()
    .insert(schema.gyms)
    .values(seed.map(({ slug, name, note }) => ({ slug, name, note })))
    .onConflictDoUpdate({
      target: schema.gyms.slug,
      set: { name: sql`excluded.name`, note: sql`excluded.note` },
    });

  const gymRows = await db().select().from(schema.gyms);
  const gymBySlug = new Map(gymRows.map((row) => [row.slug, row.id]));

  const exerciseRows = await db()
    .select({ id: schema.exercises.id, slug: schema.exercises.slug })
    .from(schema.exercises);
  const exerciseBySlug = new Map(exerciseRows.map((row) => [row.slug, row.id]));

  for (const gym of seed) {
    const gymId = gymBySlug.get(gym.slug);
    if (gymId === undefined) {
      continue;
    }
    const links = gym.exerciseSlugs
      .map((slug) => exerciseBySlug.get(slug))
      .filter((id): id is number => id !== undefined)
      .map((exerciseId) => ({ gymId, exerciseId }));

    await db().delete(schema.gymExercises).where(eq(schema.gymExercises.gymId, gymId));
    if (links.length > 0) {
      await db().insert(schema.gymExercises).values(links);
    }
  }
}

/** Taille du référentiel, pour décider s'il faut le semer. */
export async function catalogSize(): Promise<{ exercises: number; gyms: number }> {
  const [exerciseRow] = await db()
    .select({ count: sql<string>`count(*)` })
    .from(schema.exercises);
  const [gymRow] = await db().select({ count: sql<string>`count(*)` }).from(schema.gyms);
  return { exercises: Number(exerciseRow?.count ?? 0), gyms: Number(gymRow?.count ?? 0) };
}

export async function listGyms(): Promise<Gym[]> {
  const rows = await db().select().from(schema.gyms).orderBy(asc(schema.gyms.name));
  return rows.map((row) => ({ id: row.id, slug: row.slug, name: row.name, note: row.note }));
}

/** Les préférences d'entraînement, ou `null` si le compte n'a jamais répondu. */
export async function findPreferences(userId: number): Promise<TrainingPreferences | null> {
  const [row] = await db()
    .select()
    .from(schema.trainingPreferences)
    .where(eq(schema.trainingPreferences.userId, userId))
    .limit(1);

  if (!row) {
    return null;
  }
  return {
    gymId: row.gymId,
    focus: isTrainingFocus(row.focus) ? row.focus : 'full',
    equipment: isEquipmentPreference(row.equipment) ? row.equipment : 'any',
    sessionsPerWeek: row.sessionsPerWeek,
  };
}

export async function upsertPreferences(
  userId: number,
  preferences: TrainingPreferences,
): Promise<void> {
  await db()
    .insert(schema.trainingPreferences)
    .values({ userId, ...preferences })
    .onConflictDoUpdate({
      target: schema.trainingPreferences.userId,
      set: {
        gymId: sql`excluded.gym_id`,
        focus: sql`excluded.focus`,
        equipment: sql`excluded.equipment`,
        sessionsPerWeek: sql`excluded.sessions_per_week`,
        updatedAt: sql`now()`,
      },
    });
}

/**
 * Crée un exercice saisi à la main, ou rend celui qui porte déjà ce slug.
 * `created` dit lequel : seul un nom nouveau passe par la modération.
 *
 * `rank` reste nul : l'exercice entre au catalogue pour que la séance importée
 * puisse le référencer, mais il n'entrera jamais dans un programme généré. Le
 * catalogue est commun, et une ligne recopiée d'un carnet n'a pas à se
 * retrouver prescrite chez quelqu'un d'autre.
 */
export async function findOrCreateExercise(input: {
  slug: string;
  name: string;
  kind: Exercise['kind'];
  muscleGroup: string | null;
  region: Exercise['region'];
  equipment: Exercise['equipment'];
}): Promise<{ exercise: Exercise; created: boolean }> {
  const [existing] = await db()
    .select()
    .from(schema.exercises)
    .where(eq(schema.exercises.slug, input.slug))
    .limit(1);

  if (existing) {
    return { exercise: toExercise(existing), created: false };
  }

  const [created] = await db()
    .insert(schema.exercises)
    .values({ ...input, rank: null, aliases: [], source: 'manual' })
    .onConflictDoNothing({ target: schema.exercises.slug })
    .returning();

  if (created) {
    return { exercise: toExercise(created), created: true };
  }

  // Une écriture concurrente a gagné la course : la ligne existe désormais.
  const [raced] = await db()
    .select()
    .from(schema.exercises)
    .where(eq(schema.exercises.slug, input.slug))
    .limit(1);
  if (!raced) {
    throw new Error("L'exercice n'a pas pu être créé.");
  }
  return { exercise: toExercise(raced), created: false };
}

/** Les exercices demandés, indexés par leur slug. */
export async function exercisesBySlug(
  slugs: readonly string[],
): Promise<Map<string, Exercise>> {
  const found = new Map<string, Exercise>();
  if (slugs.length === 0) {
    return found;
  }
  const rows = await db()
    .select()
    .from(schema.exercises)
    .where(inArray(schema.exercises.slug, [...slugs]));
  for (const row of rows) {
    found.set(row.slug, toExercise(row));
  }
  return found;
}

/** Les exercices d'une série de modèles, prescriptions comprises. */
async function templateExercisesFor(
  templateIds: readonly number[],
): Promise<Map<number, TemplateExercise[]>> {
  const grouped = new Map<number, TemplateExercise[]>();
  if (templateIds.length === 0) {
    return grouped;
  }

  const rows = await db()
    .select({
      id: schema.workoutTemplateExercises.id,
      templateId: schema.workoutTemplateExercises.templateId,
      position: schema.workoutTemplateExercises.position,
      targetSets: schema.workoutTemplateExercises.targetSets,
      targetRepsMin: schema.workoutTemplateExercises.targetRepsMin,
      targetRepsMax: schema.workoutTemplateExercises.targetRepsMax,
      targetSeconds: schema.workoutTemplateExercises.targetSeconds,
      supersetGroup: schema.workoutTemplateExercises.supersetGroup,
      restSeconds: schema.workoutTemplateExercises.restSeconds,
      notes: schema.workoutTemplateExercises.notes,
      exercise: schema.exercises,
    })
    .from(schema.workoutTemplateExercises)
    .innerJoin(
      schema.exercises,
      eq(schema.exercises.id, schema.workoutTemplateExercises.exerciseId),
    )
    .where(inArray(schema.workoutTemplateExercises.templateId, [...templateIds]))
    .orderBy(
      asc(schema.workoutTemplateExercises.templateId),
      asc(schema.workoutTemplateExercises.position),
    );

  for (const row of rows) {
    const list = grouped.get(row.templateId) ?? [];
    list.push({
      id: row.id,
      position: row.position,
      exercise: toExercise(row.exercise),
      targetSets: row.targetSets,
      targetRepsMin: row.targetRepsMin,
      targetRepsMax: row.targetRepsMax,
      targetSeconds: row.targetSeconds,
      supersetGroup: row.supersetGroup,
      restSeconds: row.restSeconds,
      notes: row.notes,
    });
    grouped.set(row.templateId, list);
  }

  return grouped;
}

function toTemplate(
  row: typeof schema.workoutTemplates.$inferSelect,
  exercises: TemplateExercise[],
): WorkoutTemplate {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    notes: row.notes,
    kind: isTemplateKind(row.kind) ? row.kind : 'program',
    favorite: row.favorite,
    exercises,
  };
}

/**
 * Les séances modèles actives d'un utilisateur : le programme dans son ordre,
 * puis les séances à lui. Les séances improvisées n'en font pas partie, elles
 * ne se relancent pas.
 */
export async function listTemplates(userId: number): Promise<WorkoutTemplate[]> {
  const rows = await db()
    .select()
    .from(schema.workoutTemplates)
    .where(
      and(
        eq(schema.workoutTemplates.userId, userId),
        isNull(schema.workoutTemplates.archivedAt),
        inArray(schema.workoutTemplates.kind, ['program', 'custom']),
      ),
    )
    .orderBy(asc(schema.workoutTemplates.position), asc(schema.workoutTemplates.id));

  const exercises = await templateExercisesFor(rows.map((row) => row.id));
  return rows.map((row) => toTemplate(row, exercises.get(row.id) ?? []));
}

export async function findTemplate(
  userId: number,
  id: number,
): Promise<WorkoutTemplate | null> {
  const [row] = await db()
    .select()
    .from(schema.workoutTemplates)
    .where(and(eq(schema.workoutTemplates.userId, userId), eq(schema.workoutTemplates.id, id)))
    .limit(1);

  if (!row) {
    return null;
  }
  const exercises = await templateExercisesFor([row.id]);
  return toTemplate(row, exercises.get(row.id) ?? []);
}

export interface NewTemplateExercise {
  exerciseId: number;
  targetSets: number;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetSeconds: number | null;
  supersetGroup: number | null;
  restSeconds: number | null;
  notes: string | null;
}

/** Crée une séance modèle et ses exercices. */
export async function insertTemplate(
  userId: number,
  template: {
    name: string;
    position: number;
    notes: string | null;
    kind?: TemplateKind;
    favorite?: boolean;
    sourceSessionId?: number | null;
  },
  exercises: readonly NewTemplateExercise[],
): Promise<number> {
  const [row] = await db()
    .insert(schema.workoutTemplates)
    .values({ userId, ...template })
    .returning({ id: schema.workoutTemplates.id });

  const templateId = row?.id;
  if (templateId === undefined) {
    throw new Error("La séance n'a pas pu être créée.");
  }

  if (exercises.length > 0) {
    await db()
      .insert(schema.workoutTemplateExercises)
      .values(
        exercises.map((exercise, index) => ({ templateId, position: index, ...exercise })),
      );
  }
  return templateId;
}

/**
 * Archive toutes les séances actives d'un compte.
 *
 * Employé quand on régénère le programme : les anciennes séances ne sont pas
 * supprimées mais mises de côté, parce que les séances déjà réalisées les
 * référencent et que les effacer ferait perdre le nom de ce qu'on a fait
 * pendant des mois.
 *
 * Seul le programme est concerné. Une séance du programme mise en favori
 * n'est pas archivée : elle le quitte pour rejoindre les séances à soi, parce
 * que recomposer ne doit pas faire perdre ce qu'on a choisi de garder.
 */
export async function archiveAllTemplates(userId: number): Promise<number> {
  const program = and(
    eq(schema.workoutTemplates.userId, userId),
    isNull(schema.workoutTemplates.archivedAt),
    eq(schema.workoutTemplates.kind, 'program'),
  );
  await db()
    .update(schema.workoutTemplates)
    .set({ kind: 'custom' })
    .where(and(program, eq(schema.workoutTemplates.favorite, true)));
  const updated = await db()
    .update(schema.workoutTemplates)
    .set({ archivedAt: new Date() })
    .where(program)
    .returning({ id: schema.workoutTemplates.id });
  return updated.length;
}

/**
 * Range une séance dans les favoris, ou l'en sort.
 *
 * Une séance improvisée qu'on garde devient une séance à soi, sous le nom
 * choisi. Une séance à soi qu'on retire des favoris est archivée : elle
 * n'apparaissait que là, la garder active la rendrait introuvable. Une séance
 * du programme reste au programme dans les deux sens.
 */
export async function setTemplateFavorite(
  userId: number,
  id: number,
  favorite: boolean,
  name: string | null,
): Promise<boolean> {
  const [row] = await db()
    .select({ kind: schema.workoutTemplates.kind })
    .from(schema.workoutTemplates)
    .where(
      and(
        eq(schema.workoutTemplates.userId, userId),
        eq(schema.workoutTemplates.id, id),
        isNull(schema.workoutTemplates.archivedAt),
      ),
    )
    .limit(1);
  if (!row) {
    return false;
  }

  const change: Partial<typeof schema.workoutTemplates.$inferInsert> = { favorite };
  if (favorite && row.kind === 'adhoc') {
    change.kind = 'custom';
  }
  if (favorite && name !== null) {
    change.name = name;
    // Un nouveau nom se revérifie avant d'être revu dans le fil.
    change.nameReviewedAt = null;
    change.nameHiddenAt = null;
  }
  if (!favorite && row.kind === 'custom') {
    change.archivedAt = new Date();
  }

  const updated = await db()
    .update(schema.workoutTemplates)
    .set(change)
    .where(and(eq(schema.workoutTemplates.userId, userId), eq(schema.workoutTemplates.id, id)))
    .returning({ id: schema.workoutTemplates.id });
  return updated.length > 0;
}

/** Parmi ces séances faites, celles déjà retenues comme favori actif. */
export async function favoritedSessionIds(
  userId: number,
  sessionIds: readonly number[],
): Promise<Set<number>> {
  if (sessionIds.length === 0) {
    return new Set();
  }
  const rows = await db()
    .select({ sessionId: schema.workoutTemplates.sourceSessionId })
    .from(schema.workoutTemplates)
    .where(
      and(
        eq(schema.workoutTemplates.userId, userId),
        isNull(schema.workoutTemplates.archivedAt),
        eq(schema.workoutTemplates.favorite, true),
        inArray(schema.workoutTemplates.sourceSessionId, [...sessionIds]),
      ),
    );
  return new Set(
    rows.map((row) => row.sessionId).filter((value): value is number => value !== null),
  );
}

/**
 * Ajoute un exercice en fin de séance modèle, et rend l'identifiant de sa ligne.
 *
 * La propriété est vérifiée avant l'écriture : un identifiant de modèle venu
 * du client ne dit rien de son auteur.
 */
export async function appendTemplateExercise(
  userId: number,
  templateId: number,
  exercise: NewTemplateExercise,
): Promise<number | null> {
  const [owner] = await db()
    .select({ id: schema.workoutTemplates.id })
    .from(schema.workoutTemplates)
    .where(
      and(eq(schema.workoutTemplates.userId, userId), eq(schema.workoutTemplates.id, templateId)),
    )
    .limit(1);
  if (!owner) {
    return null;
  }

  const [last] = await db()
    .select({ position: sql<number | null>`max(${schema.workoutTemplateExercises.position})` })
    .from(schema.workoutTemplateExercises)
    .where(eq(schema.workoutTemplateExercises.templateId, templateId));

  const [row] = await db()
    .insert(schema.workoutTemplateExercises)
    .values({ templateId, position: Number(last?.position ?? -1) + 1, ...exercise })
    .returning({ id: schema.workoutTemplateExercises.id });
  return row?.id ?? null;
}

/** Les exercices mis en favori par l'utilisateur, les plus anciens d'abord. */
export async function listFavoriteExerciseIds(userId: number): Promise<number[]> {
  const rows = await db()
    .select({ exerciseId: schema.favoriteExercises.exerciseId })
    .from(schema.favoriteExercises)
    .where(eq(schema.favoriteExercises.userId, userId))
    .orderBy(asc(schema.favoriteExercises.createdAt));
  return rows.map((row) => row.exerciseId);
}

/** Met un exercice en favori ou l'en retire. Rejouable sans effet de bord. */
export async function setFavoriteExercise(
  userId: number,
  exerciseId: number,
  favorite: boolean,
): Promise<void> {
  if (favorite) {
    await db()
      .insert(schema.favoriteExercises)
      .values({ userId, exerciseId })
      .onConflictDoNothing();
    return;
  }
  await db()
    .delete(schema.favoriteExercises)
    .where(
      and(
        eq(schema.favoriteExercises.userId, userId),
        eq(schema.favoriteExercises.exerciseId, exerciseId),
      ),
    );
}

/** Archive une séance modèle plutôt que de la supprimer (voir le schéma). */
export async function archiveTemplate(userId: number, id: number): Promise<boolean> {
  const updated = await db()
    .update(schema.workoutTemplates)
    .set({ archivedAt: new Date() })
    .where(and(eq(schema.workoutTemplates.userId, userId), eq(schema.workoutTemplates.id, id)))
    .returning({ id: schema.workoutTemplates.id });
  return updated.length > 0;
}

export async function countTemplates(userId: number): Promise<number> {
  const [row] = await db()
    .select({ count: sql<string>`count(*)` })
    .from(schema.workoutTemplates)
    .where(
      and(
        eq(schema.workoutTemplates.userId, userId),
        isNull(schema.workoutTemplates.archivedAt),
      ),
    );
  return Number(row?.count ?? 0);
}

function toSet(row: typeof schema.workoutSets.$inferSelect): WorkoutSet {
  return {
    id: row.id,
    exerciseId: row.exerciseId,
    position: row.position,
    setIndex: row.setIndex,
    weightKg: toNullableNumber(row.weightKg),
    reps: row.reps,
    seconds: row.seconds,
    toFailure: row.toFailure,
    doneAt: row.doneAt,
  };
}

async function setsFor(sessionId: number): Promise<WorkoutSet[]> {
  const rows = await db()
    .select()
    .from(schema.workoutSets)
    .where(eq(schema.workoutSets.sessionId, sessionId))
    .orderBy(asc(schema.workoutSets.position), asc(schema.workoutSets.setIndex));
  return rows.map(toSet);
}

async function toSession(
  row: typeof schema.workoutSessions.$inferSelect & { templateName: string | null },
): Promise<WorkoutSession> {
  return {
    id: row.id,
    templateId: row.templateId,
    templateName: row.templateName,
    sessionDate: String(row.sessionDate).slice(0, 10),
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    visibility: isSessionVisibility(row.visibility) ? row.visibility : 'private',
    sets: await setsFor(row.id),
  };
}

/** La séance ouverte, s'il y en a une. Une seule peut l'être à la fois. */
export async function findOpenSession(userId: number): Promise<WorkoutSession | null> {
  const [row] = await db()
    .select({
      session: schema.workoutSessions,
      templateName: schema.workoutTemplates.name,
    })
    .from(schema.workoutSessions)
    .leftJoin(
      schema.workoutTemplates,
      eq(schema.workoutTemplates.id, schema.workoutSessions.templateId),
    )
    .where(
      and(
        eq(schema.workoutSessions.userId, userId),
        isNull(schema.workoutSessions.finishedAt),
      ),
    )
    .orderBy(desc(schema.workoutSessions.startedAt))
    .limit(1);

  return row ? toSession({ ...row.session, templateName: row.templateName }) : null;
}

export async function findSession(
  userId: number,
  id: number,
): Promise<WorkoutSession | null> {
  const [row] = await db()
    .select({
      session: schema.workoutSessions,
      templateName: schema.workoutTemplates.name,
    })
    .from(schema.workoutSessions)
    .leftJoin(
      schema.workoutTemplates,
      eq(schema.workoutTemplates.id, schema.workoutSessions.templateId),
    )
    .where(and(eq(schema.workoutSessions.userId, userId), eq(schema.workoutSessions.id, id)))
    .limit(1);

  return row ? toSession({ ...row.session, templateName: row.templateName }) : null;
}

/** Les dernières séances terminées, pour l'historique. */
export async function listSessions(
  userId: number,
  limit: number,
): Promise<WorkoutSession[]> {
  const rows = await db()
    .select({
      session: schema.workoutSessions,
      templateName: schema.workoutTemplates.name,
    })
    .from(schema.workoutSessions)
    .leftJoin(
      schema.workoutTemplates,
      eq(schema.workoutTemplates.id, schema.workoutSessions.templateId),
    )
    .where(eq(schema.workoutSessions.userId, userId))
    .orderBy(desc(schema.workoutSessions.sessionDate), desc(schema.workoutSessions.id))
    .limit(limit);

  return Promise.all(
    rows.map((row) => toSession({ ...row.session, templateName: row.templateName })),
  );
}

export async function insertSession(
  userId: number,
  templateId: number | null,
  sessionDate: string,
): Promise<number> {
  const [row] = await db()
    .insert(schema.workoutSessions)
    .values({ userId, templateId, sessionDate })
    .returning({ id: schema.workoutSessions.id });

  if (row?.id === undefined) {
    throw new Error("La séance n'a pas pu être ouverte.");
  }
  return row.id;
}

export async function finishSession(userId: number, id: number): Promise<boolean> {
  const updated = await db()
    .update(schema.workoutSessions)
    .set({ finishedAt: new Date() })
    .where(
      and(
        eq(schema.workoutSessions.userId, userId),
        eq(schema.workoutSessions.id, id),
        isNull(schema.workoutSessions.finishedAt),
      ),
    )
    .returning({ id: schema.workoutSessions.id });
  return updated.length > 0;
}

export async function deleteSession(userId: number, id: number): Promise<boolean> {
  const deleted = await db()
    .delete(schema.workoutSessions)
    .where(and(eq(schema.workoutSessions.userId, userId), eq(schema.workoutSessions.id, id)))
    .returning({ id: schema.workoutSessions.id });
  return deleted.length > 0;
}

export interface RecordSetInput {
  sessionId: number;
  exerciseId: number;
  position: number;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  seconds: number | null;
  toFailure: boolean;
}

/**
 * Écrit une série, ou réécrit celle qui occupe déjà ce rang.
 *
 * L'unicité porte sur le triplet séance, exercice, numéro de série : corriger
 * une charge mal saisie doit remplacer la valeur, jamais ajouter une série
 * fantôme au volume de la séance.
 */
export async function upsertSet(userId: number, input: RecordSetInput): Promise<boolean> {
  // La séance doit être la sienne : l'identifiant vient du client.
  const [session] = await db()
    .select({ id: schema.workoutSessions.id })
    .from(schema.workoutSessions)
    .where(
      and(
        eq(schema.workoutSessions.userId, userId),
        eq(schema.workoutSessions.id, input.sessionId),
      ),
    )
    .limit(1);

  if (!session) {
    return false;
  }

  await db()
    .insert(schema.workoutSets)
    .values({
      sessionId: input.sessionId,
      userId,
      exerciseId: input.exerciseId,
      position: input.position,
      setIndex: input.setIndex,
      weightKg: input.weightKg === null ? null : String(input.weightKg),
      reps: input.reps,
      seconds: input.seconds,
      toFailure: input.toFailure,
      doneAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        schema.workoutSets.sessionId,
        schema.workoutSets.exerciseId,
        schema.workoutSets.setIndex,
      ],
      set: {
        weightKg: sql`excluded.weight_kg`,
        reps: sql`excluded.reps`,
        seconds: sql`excluded.seconds`,
        toFailure: sql`excluded.to_failure`,
        doneAt: sql`now()`,
      },
    });
  return true;
}

/**
 * Écrit une séance déjà terminée, avec toutes ses séries.
 *
 * Sert à l'import d'une séance recopiée après coup. La séance naît close :
 * elle n'est pas en cours, elle a eu lieu. L'ouvrir puis la fermer ferait
 * passer l'utilisateur par l'écran d'exécution d'une séance qu'il vient de
 * terminer, et se heurterait à la règle d'une seule séance ouverte.
 */
export async function insertCompletedSession(
  userId: number,
  sessionDate: string,
  sets: readonly Omit<RecordSetInput, 'sessionId'>[],
): Promise<number> {
  const now = new Date();
  const [row] = await db()
    .insert(schema.workoutSessions)
    .values({ userId, templateId: null, sessionDate, startedAt: now, finishedAt: now })
    .returning({ id: schema.workoutSessions.id });

  const sessionId = row?.id;
  if (sessionId === undefined) {
    throw new Error("La séance n'a pas pu être enregistrée.");
  }

  if (sets.length > 0) {
    await db()
      .insert(schema.workoutSets)
      .values(
        sets.map((set) => ({
          sessionId,
          userId,
          exerciseId: set.exerciseId,
          position: set.position,
          setIndex: set.setIndex,
          weightKg: set.weightKg === null ? null : String(set.weightKg),
          reps: set.reps,
          seconds: set.seconds,
          toFailure: set.toFailure,
          doneAt: now,
        })),
      )
      .onConflictDoNothing({
        target: [
          schema.workoutSets.sessionId,
          schema.workoutSets.exerciseId,
          schema.workoutSets.setIndex,
        ],
      });
  }

  return sessionId;
}

export async function deleteSet(userId: number, setId: number): Promise<boolean> {
  const deleted = await db()
    .delete(schema.workoutSets)
    .where(and(eq(schema.workoutSets.userId, userId), eq(schema.workoutSets.id, setId)))
    .returning({ id: schema.workoutSets.id });
  return deleted.length > 0;
}

/**
 * Les séries de la dernière séance où chaque exercice a été travaillé.
 *
 * C'est la requête qui justifie tout le module : sans elle, on refait chaque
 * semaine la charge dont on se souvient, c'est-à-dire la plus confortable.
 * La séance en cours est exclue, sans quoi la référence serait la série qu'on
 * vient de faire.
 */
export async function lastPerformance(
  userId: number,
  exerciseIds: readonly number[],
  excludeSessionId: number | null,
): Promise<Map<number, WorkoutSet[]>> {
  const byExercise = new Map<number, WorkoutSet[]>();
  if (exerciseIds.length === 0) {
    return byExercise;
  }

  // `DISTINCT ON` retient la séance la plus récente par exercice, puis la
  // jointure ramène toutes ses séries : une seule requête là où une boucle en
  // ferait une par exercice.
  // Les `bigint` arrivent en chaîne sur une requête brute, là où le
  // constructeur de requêtes les convertit grâce au mode `number` du schéma.
  // Sans la conversion qui suit, la clé de la carte serait « 1 » et non 1, et
  // aucun appelant ne retrouverait son exercice.
  const result = await db().execute<{
    exercise_id: string;
    id: string;
    position: number;
    set_index: number;
    weight_kg: string | null;
    reps: number | null;
    seconds: number | null;
    to_failure: boolean;
    done_at: string;
  }>(sql`
    WITH derniere AS (
      SELECT DISTINCT ON (s.exercise_id) s.exercise_id, s.session_id
      FROM workout_sets s
      JOIN workout_sessions w ON w.id = s.session_id
      WHERE s.user_id = ${userId}
        AND s.exercise_id IN (${sql.join(
          exerciseIds.map((id) => sql`${id}`),
          sql`, `,
        )})
        ${excludeSessionId === null ? sql`` : sql`AND s.session_id <> ${excludeSessionId}`}
      ORDER BY s.exercise_id, w.session_date DESC, s.done_at DESC
    )
    SELECT s.exercise_id, s.id, s.position, s.set_index, s.weight_kg, s.reps,
           s.seconds, s.to_failure, s.done_at
    FROM workout_sets s
    JOIN derniere d ON d.exercise_id = s.exercise_id AND d.session_id = s.session_id
    WHERE s.user_id = ${userId}
    ORDER BY s.exercise_id, s.set_index
  `);

  for (const row of result.rows) {
    const exerciseId = Number(row.exercise_id);
    const list = byExercise.get(exerciseId) ?? [];
    list.push({
      id: Number(row.id),
      exerciseId,
      position: row.position,
      setIndex: row.set_index,
      weightKg: toNullableNumber(row.weight_kg),
      reps: row.reps,
      seconds: row.seconds,
      toFailure: row.to_failure,
      doneAt: new Date(row.done_at),
    });
    byExercise.set(exerciseId, list);
  }

  return byExercise;
}

/**
 * Les séries d'un utilisateur, avec leur jour et leur exercice, pour la
 * progression.
 *
 * Une seule requête plate plutôt qu'une agrégation en SQL : la mesure dépend
 * de l'exercice (charge, répétitions ou durée), et la décider en base
 * dupliquerait la règle de `@/lib/workout-progress`, qui reste la seule.
 * Douze semaines à quatre séances et vingt séries tiennent en un millier de
 * lignes.
 *
 * Les deux tables sont filtrées sur l'utilisateur, et non la seule table des
 * séries : la jointure ne doit pas pouvoir remonter la séance d'un autre.
 */
export async function progressSets(
  userId: number,
  options: { sinceDate?: string; exerciseId?: number } = {},
): Promise<{ exercises: ProgressExercise[]; sets: ProgressSet[] }> {
  const rows = await db()
    .select({
      set: schema.workoutSets,
      sessionDate: schema.workoutSessions.sessionDate,
      exercise: schema.exercises,
    })
    .from(schema.workoutSets)
    .innerJoin(schema.workoutSessions, eq(schema.workoutSessions.id, schema.workoutSets.sessionId))
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.workoutSets.exerciseId))
    .where(
      and(
        eq(schema.workoutSets.userId, userId),
        eq(schema.workoutSessions.userId, userId),
        options.sinceDate === undefined
          ? undefined
          : gte(schema.workoutSessions.sessionDate, options.sinceDate),
        options.exerciseId === undefined
          ? undefined
          : eq(schema.workoutSets.exerciseId, options.exerciseId),
      ),
    )
    .orderBy(
      asc(schema.workoutSessions.sessionDate),
      asc(schema.workoutSessions.id),
      asc(schema.workoutSets.setIndex),
    );

  const exercises = new Map<number, ProgressExercise>();
  const sets: ProgressSet[] = [];
  for (const row of rows) {
    if (!exercises.has(row.exercise.id)) {
      const exercise = toExercise(row.exercise);
      exercises.set(exercise.id, {
        id: exercise.id,
        name: exercise.name,
        kind: exercise.kind,
        muscleGroup: exercise.muscleGroup,
      });
    }
    sets.push({
      sessionId: row.set.sessionId,
      sessionDate: String(row.sessionDate).slice(0, 10),
      exerciseId: row.set.exerciseId,
      weightKg: toNullableNumber(row.set.weightKg),
      reps: row.set.reps,
      seconds: row.set.seconds,
      toFailure: row.set.toFailure,
    });
  }

  return { exercises: [...exercises.values()], sets };
}

/**
 * Toutes les séries passées de quelques exercices, réduites à leurs mesures.
 *
 * Sert au record : il se calcule sur toute l'histoire, pas sur la dernière
 * séance, et c'est `@/lib/workout-progress` qui décide de la mesure. Quelques
 * exercices sur des mois tiennent en quelques centaines de lignes.
 */
export async function historySets(
  userId: number,
  exerciseIds: readonly number[],
  excludeSessionId: number | null,
): Promise<Map<number, { weightKg: number | null; reps: number | null; seconds: number | null }[]>> {
  const byExercise = new Map<
    number,
    { weightKg: number | null; reps: number | null; seconds: number | null }[]
  >();
  if (exerciseIds.length === 0) {
    return byExercise;
  }

  const conditions = [
    eq(schema.workoutSets.userId, userId),
    inArray(schema.workoutSets.exerciseId, [...exerciseIds]),
  ];
  if (excludeSessionId !== null) {
    conditions.push(sql`${schema.workoutSets.sessionId} <> ${excludeSessionId}`);
  }

  const rows = await db()
    .select({
      exerciseId: schema.workoutSets.exerciseId,
      weightKg: schema.workoutSets.weightKg,
      reps: schema.workoutSets.reps,
      seconds: schema.workoutSets.seconds,
    })
    .from(schema.workoutSets)
    .where(and(...conditions));

  for (const row of rows) {
    const list = byExercise.get(row.exerciseId) ?? [];
    list.push({
      weightKg: toNullableNumber(row.weightKg),
      reps: row.reps,
      seconds: row.seconds,
    });
    byExercise.set(row.exerciseId, list);
  }
  return byExercise;
}

/**
 * Les séries des dernières séances terminées d'un modèle, la plus récente en
 * tête. Ce qu'on y lit : quel exercice a occupé chaque rang, pour reconnaître
 * un remplacement devenu habituel.
 */
export async function recentTemplateSessionSets(
  userId: number,
  templateId: number,
  excludeSessionId: number,
  limit: number,
): Promise<{ exerciseId: number; position: number }[][]> {
  const sessions = await db()
    .select({ id: schema.workoutSessions.id })
    .from(schema.workoutSessions)
    .where(
      and(
        eq(schema.workoutSessions.userId, userId),
        eq(schema.workoutSessions.templateId, templateId),
        sql`${schema.workoutSessions.finishedAt} is not null`,
        sql`${schema.workoutSessions.id} <> ${excludeSessionId}`,
      ),
    )
    .orderBy(desc(schema.workoutSessions.sessionDate), desc(schema.workoutSessions.startedAt))
    .limit(limit);

  if (sessions.length === 0) {
    return [];
  }

  const rows = await db()
    .select({
      sessionId: schema.workoutSets.sessionId,
      exerciseId: schema.workoutSets.exerciseId,
      position: schema.workoutSets.position,
    })
    .from(schema.workoutSets)
    .where(
      and(
        eq(schema.workoutSets.userId, userId),
        inArray(
          schema.workoutSets.sessionId,
          sessions.map((session) => session.id),
        ),
      ),
    );

  return sessions.map((session) =>
    rows
      .filter((row) => row.sessionId === session.id)
      .map((row) => ({ exerciseId: row.exerciseId, position: row.position })),
  );
}

/**
 * Modifie un exercice d'une séance modèle : l'exercice lui-même, ou son repos.
 *
 * Le modèle doit appartenir à l'utilisateur. La condition passe par une
 * sous-requête et non par une lecture préalable : l'identifiant de la ligne
 * vient du client, et une seule instruction ne laisse aucun intervalle où la
 * vérification et l'écriture divergeraient.
 */
export async function updateTemplateExercise(
  userId: number,
  entryId: number,
  patch: { exerciseId?: number; restSeconds?: number | null },
): Promise<boolean> {
  const rows = await db()
    .update(schema.workoutTemplateExercises)
    .set(patch)
    .where(
      and(
        eq(schema.workoutTemplateExercises.id, entryId),
        inArray(
          schema.workoutTemplateExercises.templateId,
          db()
            .select({ id: schema.workoutTemplates.id })
            .from(schema.workoutTemplates)
            .where(eq(schema.workoutTemplates.userId, userId)),
        ),
      ),
    )
    .returning({ id: schema.workoutTemplateExercises.id });
  return rows.length > 0;
}

/**
 * Les jours où l'utilisateur a ouvert une séance depuis une date, sans doublon.
 *
 * Sert au calcul de la cible : un jour d'entraînement reçoit plus, et la
 * fréquence réellement tenue décide combien.
 */
export async function trainingDates(userId: number, sinceDate: string): Promise<string[]> {
  const rows = await db()
    .selectDistinct({ day: schema.workoutSessions.sessionDate })
    .from(schema.workoutSessions)
    .where(
      and(
        eq(schema.workoutSessions.userId, userId),
        gte(schema.workoutSessions.sessionDate, sinceDate),
      ),
    );
  return rows.map((row) => String(row.day).slice(0, 10));
}
