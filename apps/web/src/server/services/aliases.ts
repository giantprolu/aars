import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { search } from './search';
import type { Candidate, ReferenceFood } from '@/lib/types';

/**
 * Alias d'aliment (FR-19) et candidats (FR-18).
 *
 * Un alias associe un nom libre rendu par le modèle de vision à l'aliment de
 * référence que l'utilisateur a choisi. La fois suivante, ce choix est proposé
 * en tête plutôt que de refaire chercher parmi cinq candidats.
 */

/** Au plus cinq candidats par nom (FR-18). */
const MAX_CANDIDATES = 5;

/**
 * Normalisation du nom libre, identique côté application et côté base.
 * `alias_norm` porte l'unicité : un nom ne porte jamais plus d'un alias.
 */
export function normalizeAlias(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

async function findAliasTarget(
  userId: number,
  name: string,
): Promise<{ kind: 'ciqual' | 'product'; ref: string } | null> {
  const [row] = await db()
    .select()
    .from(schema.foodAliases)
    .where(
      and(
        eq(schema.foodAliases.userId, userId),
        eq(schema.foodAliases.aliasNorm, normalizeAlias(name)),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }
  return { kind: row.targetKind as 'ciqual' | 'product', ref: row.targetRef };
}

async function loadReferenceFood(
  kind: 'ciqual' | 'product',
  ref: string,
): Promise<ReferenceFood | null> {
  if (kind === 'product') {
    const [row] = await db()
      .select()
      .from(schema.products)
      .where(eq(schema.products.barcode, ref))
      .limit(1);
    return row
      ? {
          kind: 'product',
          ref: row.barcode,
          name: row.name,
          per100g: {
            kcal: Number(row.kcal100g),
            proteinG: Number(row.protein100g),
            carbsG: Number(row.carbs100g),
            fatG: Number(row.fat100g),
          },
          servingSizeG: row.servingSizeG === null ? null : Number(row.servingSizeG),
        }
      : null;
  }

  const [row] = await db()
    .select()
    .from(schema.ciqualFoods)
    .where(eq(schema.ciqualFoods.ciqualCode, ref))
    .limit(1);

  if (!row || !row.isComplete) {
    return null;
  }
  return {
    kind: 'ciqual',
    ref: row.ciqualCode,
    name: row.name,
    per100g: {
      kcal: Number(row.kcal100g),
      proteinG: Number(row.protein100g),
      carbsG: Number(row.carbs100g),
      fatG: Number(row.fat100g),
    },
    servingSizeG: null,
  };
}

/**
 * Candidats pour un nom reconnu (FR-18).
 * Un alias déjà choisi passe en tête et n'apparaît pas deux fois.
 */
export async function candidatesFor(userId: number, name: string): Promise<Candidate[]> {
  const hits = await search(name, MAX_CANDIDATES);
  const candidates: Candidate[] = hits.map((hit) => ({ ...hit, fromAlias: false }));

  const alias = await findAliasTarget(userId, name);
  if (!alias) {
    return candidates.slice(0, MAX_CANDIDATES);
  }

  const target = await loadReferenceFood(alias.kind, alias.ref);
  if (!target) {
    // L'alias pointe vers un aliment disparu : on l'ignore plutôt que d'échouer.
    return candidates.slice(0, MAX_CANDIDATES);
  }

  const rest = candidates.filter(
    (candidate) => !(candidate.kind === target.kind && candidate.ref === target.ref),
  );

  return [
    {
      ...target,
      // L'alias pointe toujours vers une fiche déjà en base : jamais vers un
      // produit que seule la recherche Open Food Facts connaîtrait.
      origin: target.kind === 'ciqual' ? ('ciqual' as const) : ('cache' as const),
      similarity: 1,
      fromAlias: true,
    },
    ...rest,
  ].slice(0, MAX_CANDIDATES);
}

/** Crée ou met à jour l'alias d'un nom (FR-19). Un nouveau choix remplace l'ancien. */
export async function rememberAlias(
  userId: number,
  name: string,
  targetKind: 'ciqual' | 'product',
  targetRef: string,
): Promise<void> {
  const values = {
    userId,
    aliasNorm: normalizeAlias(name),
    targetKind,
    targetRef,
    updatedAt: new Date(),
  };

  await db()
    .insert(schema.foodAliases)
    .values(values)
    .onConflictDoUpdate({
      // Le conflit porte sur le couple, comme la contrainte d'unicité.
      target: [schema.foodAliases.userId, schema.foodAliases.aliasNorm],
      set: {
        targetKind: sql`excluded.target_kind`,
        targetRef: sql`excluded.target_ref`,
        updatedAt: sql`now()`,
      },
    });
}
