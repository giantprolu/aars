/**
 * Vérification de contrat avec Open Food Facts.
 *
 * Cette API est un service tiers dont les noms de champs peuvent changer. Ce
 * script confronte src/lib/client/openfoodfacts.ts au service réel, pour que
 * la rupture soit détectée ici plutôt que sur un scan raté.
 *
 * Volontairement hors de la Definition of Done : il dépend du réseau et ne doit
 * pas faire échouer un commit. Lancement : npx tsx scripts/verify-off.ts
 */
import assert from 'node:assert/strict';
import { lookupBarcode } from '../src/lib/client/openfoodfacts';

// Produit très stable de la base : pâte à tartiner Ferrero.
const found = await lookupBarcode('3017620422003');
assert.equal(found.kind, 'found', `attendu found, obtenu ${found.kind}`);
if (found.kind === 'found') {
  assert.ok(found.product.name.length > 0, 'un nom est extrait');
  assert.ok(found.product.per100g.kcal > 0, 'energie extraite');
  assert.ok(found.product.per100g.carbsG > 0, 'glucides extraits');
  console.log(
    `found: ${found.product.name} — ${found.product.per100g.kcal} kcal/100 g, ` +
      `portion ${found.product.servingSizeG ?? 'non declaree'}`,
  );
}

// AD-3 : l'API repond HTTP 200 avec status 0. Un response.ok ici serait un bug.
const missing = await lookupBarcode('0000000000000');
assert.equal(missing.kind, 'not_found', `attendu not_found, obtenu ${missing.kind}`);
console.log('not_found correctement detecte malgre un HTTP 200');

console.log('Contrat Open Food Facts verifie.');
