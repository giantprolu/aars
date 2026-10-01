import 'server-only';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../client';
import { isAisle, type Aisle } from '@/lib/aisle';
import { isIngredientRefKind, type IngredientRefKind } from '@/lib/recipe';
import type { AggregatedNeed } from '@/lib/shopping';
import type { Macros } from '@/lib/types';

/**
 * Accès aux listes de courses et aux produits habituellement achetés.
 *
 * Comme partout, l'utilisateur est le premier argument et n'est jamais déduit.
 * Les articles le portent en colonne propre, en plus de leur liste : toute
 * lecture commence par lui, et l'établir par une jointure serait plus lent et
 * plus facile à oublier.
 */

function toNumber(value: string | null): number {
  return value === null ? 0 : Number(value);
}

function toNullableNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

export interface ShoppingItem {
  id: number;
  refKind: IngredientRefKind;
  refValue: string;
  label: string;
  quantityG: number;
  aisle: Aisle;
  unitName: string | null;
  unitGrams: number | null;
  checkedAt: Date | null;
  checkedBarcode: string | null;
  addedManually: boolean;
}

export interface ShoppingList {
  id: number;
  fromDate: string;
  toDate: string;
  closedAt: Date | null;
  createdAt: Date;
  items: ShoppingItem[];
}

function toItem(row: typeof schema.shoppingItems.$inferSelect): ShoppingItem {
  return {
    id: row.id,
    // Les contraintes en base garantissent déjà ces valeurs ; les replis
    // évitent un transtypage muet sur une ligne écrite par une version
    // antérieure du code.
    refKind: isIngredientRefKind(row.refKind) ? row.refKind : 'ciqual',
    refValue: row.refValue,
    label: row.label,
    quantityG: toNumber(row.quantityG),
    aisle: isAisle(row.aisle) ? row.aisle : 'other',
    unitName: row.unitName,
    unitGrams: toNullableNumber(row.unitGrams),
    checkedAt: row.checkedAt,
    checkedBarcode: row.checkedBarcode,
    addedManually: row.addedManually,
  };
}

async function itemsFor(listId: number): Promise<ShoppingItem[]> {
  const rows = await db()
    .select()
    .from(schema.shoppingItems)
    .where(eq(schema.shoppingItems.listId, listId))
    .orderBy(asc(schema.shoppingItems.aisle), asc(schema.shoppingItems.label));
  return rows.map(toItem);
}

async function toList(
  row: typeof schema.shoppingLists.$inferSelect,
): Promise<ShoppingList> {
  return {
    id: row.id,
    fromDate: String(row.fromDate).slice(0, 10),
    toDate: String(row.toDate).slice(0, 10),
    closedAt: row.closedAt,
    createdAt: row.createdAt,
    items: await itemsFor(row.id),
  };
}

/**
 * La liste d'une semaine donnée, ouverte ou close, ou `null` s'il n'y en a pas.
 *
 * Bornée à la semaine et non « la plus récente », et c'est ce qui compte : une
 * liste porte les quantités du panier d'une semaine précise. Rendre la
 * dernière quelle que soit sa semaine montrait, au retour du lundi suivant,
 * les courses de la semaine écoulée — avec ses quantités, ses articles déjà
 * cochés, et un réglage de parts qui ne la faisait plus bouger, puisque la
 * synchronisation ne touche que la liste de *cette* semaine.
 *
 * Les listes closes sont rendues comme les autres : les courses d'une semaine
 * faite se relisent, elles ne disparaissent pas.
 */
export async function shoppingListForWeek(
  userId: number,
  fromDate: string,
): Promise<ShoppingList | null> {
  const [row] = await db()
    .select()
    .from(schema.shoppingLists)
    .where(
      and(eq(schema.shoppingLists.userId, userId), eq(schema.shoppingLists.fromDate, fromDate)),
    )
    .orderBy(desc(schema.shoppingLists.createdAt), desc(schema.shoppingLists.id))
    .limit(1);

  return row === undefined ? null : toList(row);
}

/**
 * Crée une liste et ses articles.
 *
 * L'ancienne liste de la même période n'est pas mise à jour mais remplacée :
 * une liste de courses est un instantané du panier au moment où on la demande,
 * et rien n'est plus déroutant qu'une liste qui se réécrit sous les yeux
 * pendant qu'on fait les courses.
 *
 * Remplacée pour de bon, donc : la précédente est supprimée, et non laissée à
 * côté de la nouvelle. Deux listes ouvertes sur la même semaine donnaient deux
 * vérités dont une seule suivait le panier, et l'écran n'en montrait qu'une.
 * Les listes closes sont épargnées : elles archivent des courses faites.
 */
export async function insertShoppingList(
  userId: number,
  fromDate: string,
  toDate: string,
  needs: readonly AggregatedNeed[],
): Promise<number> {
  await db()
    .delete(schema.shoppingLists)
    .where(
      and(
        eq(schema.shoppingLists.userId, userId),
        eq(schema.shoppingLists.fromDate, fromDate),
        isNull(schema.shoppingLists.closedAt),
      ),
    );

  const [row] = await db()
    .insert(schema.shoppingLists)
    .values({ userId, fromDate, toDate })
    .returning({ id: schema.shoppingLists.id });

  const listId = row?.id;
  if (listId === undefined) {
    throw new Error("La liste de courses n'a pas pu être créée.");
  }

  await insertGeneratedItems(userId, listId, needs);
  return listId;
}

/**
 * Ajoute à une liste des articles issus des recettes.
 *
 * `addedManually` reste faux : ces lignes appartiennent au plan et la
 * synchronisation du panier a le droit de les reprendre, contrairement à
 * celles que l'on a écrites soi-même.
 */
export async function insertGeneratedItems(
  userId: number,
  listId: number,
  needs: readonly AggregatedNeed[],
): Promise<void> {
  if (needs.length === 0) {
    return;
  }

  await db()
    .insert(schema.shoppingItems)
    .values(
      needs.map((need) => ({
        listId,
        userId,
        refKind: need.refKind,
        refValue: need.refValue,
        label: need.label,
        quantityG: String(need.quantityG),
        aisle: need.aisle,
        unitName: need.unitName,
        unitGrams: need.unitGrams === null ? null : String(need.unitGrams),
      })),
    );
}

/**
 * La liste ouverte qui couvre une semaine donnée.
 *
 * Distincte de `shoppingListForWeek`, qui rend aussi les listes closes parce
 * que l'écran doit pouvoir les relire. Pour suivre un panier il faut au
 * contraire la seule liste encore ouverte : une liste close raconte des
 * courses déjà faites, qu'un changement de parts n'a pas à réécrire.
 */
export async function openShoppingListFor(
  userId: number,
  fromDate: string,
): Promise<ShoppingList | null> {
  const [row] = await db()
    .select()
    .from(schema.shoppingLists)
    .where(
      and(
        eq(schema.shoppingLists.userId, userId),
        eq(schema.shoppingLists.fromDate, fromDate),
        isNull(schema.shoppingLists.closedAt),
      ),
    )
    .orderBy(desc(schema.shoppingLists.createdAt), desc(schema.shoppingLists.id))
    .limit(1);

  return row === undefined ? null : toList(row);
}

/** Réaligne un article sur ce que les recettes réclament désormais. */
export async function updateShoppingItemNeed(
  userId: number,
  itemId: number,
  need: Pick<AggregatedNeed, 'label' | 'quantityG' | 'unitName' | 'unitGrams' | 'aisle'>,
): Promise<void> {
  await db()
    .update(schema.shoppingItems)
    .set({
      label: need.label,
      quantityG: String(need.quantityG),
      unitName: need.unitName,
      unitGrams: need.unitGrams === null ? null : String(need.unitGrams),
      aisle: need.aisle,
    })
    .where(
      and(eq(schema.shoppingItems.userId, userId), eq(schema.shoppingItems.id, itemId)),
    );
}

/** Retire des articles que plus aucune recette ne réclame. */
export async function deleteShoppingItems(
  userId: number,
  ids: readonly number[],
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await db()
    .delete(schema.shoppingItems)
    .where(
      and(
        eq(schema.shoppingItems.userId, userId),
        inArray(schema.shoppingItems.id, [...ids]),
      ),
    );
}

/** Ajoute un article à la main, hors de toute recette. */
export async function insertShoppingItem(
  userId: number,
  listId: number,
  item: {
    refKind: IngredientRefKind;
    refValue: string;
    label: string;
    quantityG: number;
    aisle: Aisle;
  },
): Promise<number | null> {
  // La liste doit être la sienne : l'identifiant vient du client.
  const [list] = await db()
    .select({ id: schema.shoppingLists.id })
    .from(schema.shoppingLists)
    .where(and(eq(schema.shoppingLists.userId, userId), eq(schema.shoppingLists.id, listId)))
    .limit(1);

  if (!list) {
    return null;
  }

  const [row] = await db()
    .insert(schema.shoppingItems)
    .values({
      listId,
      userId,
      refKind: item.refKind,
      refValue: item.refValue,
      label: item.label,
      quantityG: String(item.quantityG),
      aisle: item.aisle,
      addedManually: true,
    })
    .returning({ id: schema.shoppingItems.id });

  return row?.id ?? null;
}

/**
 * Coche ou décoche un article, et retient le code-barres du produit scanné.
 *
 * `barcode` n'est écrit que sur une coche : décocher efface la trace du
 * produit, puisque l'achat n'a pas eu lieu.
 */
export async function setItemChecked(
  userId: number,
  itemId: number,
  checked: boolean,
  barcode: string | null,
): Promise<boolean> {
  const updated = await db()
    .update(schema.shoppingItems)
    .set({
      checkedAt: checked ? new Date() : null,
      checkedBarcode: checked ? barcode : null,
    })
    .where(and(eq(schema.shoppingItems.userId, userId), eq(schema.shoppingItems.id, itemId)))
    .returning({ id: schema.shoppingItems.id });
  return updated.length > 0;
}

export async function deleteShoppingItem(userId: number, itemId: number): Promise<boolean> {
  const deleted = await db()
    .delete(schema.shoppingItems)
    .where(and(eq(schema.shoppingItems.userId, userId), eq(schema.shoppingItems.id, itemId)))
    .returning({ id: schema.shoppingItems.id });
  return deleted.length > 0;
}

/** Referme une liste : les courses sont faites. */
export async function closeShoppingList(userId: number, listId: number): Promise<boolean> {
  const updated = await db()
    .update(schema.shoppingLists)
    .set({ closedAt: new Date() })
    .where(
      and(
        eq(schema.shoppingLists.userId, userId),
        eq(schema.shoppingLists.id, listId),
        isNull(schema.shoppingLists.closedAt),
      ),
    )
    .returning({ id: schema.shoppingLists.id });
  return updated.length > 0;
}

/**
 * Mémorise le produit acheté pour un ingrédient.
 *
 * Le dernier scan l'emporte : changer de marque doit changer les macros des
 * repas suivants, sans avoir à défaire quoi que ce soit.
 */
export async function rememberIngredientProduct(
  userId: number,
  key: string,
  barcode: string,
): Promise<void> {
  await db()
    .insert(schema.ingredientProducts)
    .values({ userId, ingredientKey: key, barcode, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.ingredientProducts.userId, schema.ingredientProducts.ingredientKey],
      set: { barcode: sql`excluded.barcode`, updatedAt: sql`now()` },
    });
}

export async function forgetIngredientProduct(userId: number, key: string): Promise<void> {
  await db()
    .delete(schema.ingredientProducts)
    .where(
      and(
        eq(schema.ingredientProducts.userId, userId),
        eq(schema.ingredientProducts.ingredientKey, key),
      ),
    );
}

/** Le produit acheté pour un ingrédient : sa référence et sa fiche. */
export interface BoughtProduct {
  barcode: string;
  name: string;
  per100g: Macros;
}

/**
 * Les produits habituellement achetés pour les ingrédients demandés.
 *
 * La jointure vers `products` est interne : un produit purgé du cache fait
 * disparaître la substitution plutôt que de rendre une référence creuse, et
 * la recette retombe alors sur sa fiche d'origine.
 */
export async function boughtProductsFor(
  userId: number,
  keys: readonly string[],
): Promise<Map<string, BoughtProduct>> {
  const found = new Map<string, BoughtProduct>();
  if (keys.length === 0) {
    return found;
  }

  const rows = await db()
    .select({
      key: schema.ingredientProducts.ingredientKey,
      barcode: schema.products.barcode,
      name: schema.products.name,
      kcal: schema.products.kcal100g,
      proteinG: schema.products.protein100g,
      carbsG: schema.products.carbs100g,
      fatG: schema.products.fat100g,
    })
    .from(schema.ingredientProducts)
    .innerJoin(schema.products, eq(schema.products.barcode, schema.ingredientProducts.barcode))
    .where(
      and(
        eq(schema.ingredientProducts.userId, userId),
        inArray(schema.ingredientProducts.ingredientKey, [...keys]),
      ),
    );

  for (const row of rows) {
    found.set(row.key, {
      barcode: row.barcode,
      name: row.name,
      per100g: {
        kcal: toNumber(row.kcal),
        proteinG: toNumber(row.proteinG),
        carbsG: toNumber(row.carbsG),
        fatG: toNumber(row.fatG),
      },
    });
  }

  return found;
}

/**
 * Le groupe alimentaire de l'ANSES pour des codes CIQUAL, d'où se déduit le
 * rayon (`@/lib/aisle`).
 *
 * Les produits à code-barres n'y figurent pas : ils ne portent aucun groupe,
 * et c'est le nom seul qui décidera de leur rayon.
 */
export async function groupCodesFor(
  ciqualCodes: readonly string[],
): Promise<Map<string, string | null>> {
  const groups = new Map<string, string | null>();
  if (ciqualCodes.length === 0) {
    return groups;
  }

  const rows = await db()
    .select({
      code: schema.ciqualFoods.ciqualCode,
      groupCode: schema.ciqualFoods.groupCode,
    })
    .from(schema.ciqualFoods)
    .where(inArray(schema.ciqualFoods.ciqualCode, [...ciqualCodes]));

  for (const row of rows) {
    groups.set(row.code, row.groupCode);
  }
  return groups;
}
