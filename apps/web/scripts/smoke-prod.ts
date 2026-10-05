/**
 * Recette de la production, vue comme la PWA la voit : cookie de session,
 * pages rendues par le serveur, routes de l'API.
 *
 *   npm run smoke:prod -w @nutri/web                  (aars-app.vercel.app)
 *   npm run smoke:prod -w @nutri/web -- https://…     (une autre adresse)
 *
 * Un compte jetable est créé, exercé, puis supprimé quoi qu'il arrive : rien
 * ne reste en base. Rien n'est écrit qui se verrait chez les testeurs (pas de
 * profil Communauté, pas de séance partagée, pas de signalement), et rien qui
 * coûte (pas de reconnaissance photo). La liste manuelle qui complète ce
 * script est dans `docs/TESTS.md`.
 */

const BASE = (process.argv[2] ?? 'https://aars-app.vercel.app').replace(/\/$/, '');
const OLD_BASE = 'https://nutri-rosy-one.vercel.app';
const SESSION_COOKIE = 'nutriperso_session';

type Outcome = 'ok' | 'échec' | 'attention';
const results: { outcome: Outcome; name: string; detail: string }[] = [];
let cookie = '';

function record(outcome: Outcome, name: string, detail = ''): void {
  results.push({ outcome, name, detail });
  const mark = outcome === 'ok' ? '✓' : outcome === 'échec' ? '✗' : '!';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
}

interface Reply {
  status: number;
  body: unknown;
  text: string;
  location: string | null;
}

async function call(method: string, path: string, body?: unknown, base = BASE): Promise<Reply> {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const session = response.headers
    .getSetCookie()
    .find((line) => line.startsWith(`${SESSION_COOKIE}=`));
  if (session) cookie = session.split(';')[0] ?? '';
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed, text, location: response.headers.get('location') };
}

/** Lit un champ d'un objet JSON sans supposer sa forme. */
function field(value: unknown, ...path: (string | number)[]): unknown {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

async function expectStatus(name: string, method: string, path: string, expected: number, body?: unknown): Promise<Reply> {
  const reply = await call(method, path, body);
  if (reply.status === expected) record('ok', name);
  else record('échec', name, `${method} ${path} → ${reply.status} (attendu ${expected}) ${reply.text.slice(0, 160)}`);
  return reply;
}

/** Toute réponse 2xx : les écritures répondent 200 ou 201 selon la route. */
async function expectOk(name: string, method: string, path: string, body?: unknown): Promise<Reply> {
  const reply = await call(method, path, body);
  if (reply.status >= 200 && reply.status < 300) record('ok', name);
  else record('échec', name, `${method} ${path} → ${reply.status} ${reply.text.slice(0, 160)}`);
  return reply;
}

/** Une page rendue pour un compte connecté : 200, sans renvoi vers l'accueil. */
async function expectPage(path: string): Promise<void> {
  const reply = await call('GET', path);
  if (reply.status === 200 && !reply.text.includes('Application error')) record('ok', `page ${path}`);
  else record('échec', `page ${path}`, `${reply.status}${reply.location ? ` → ${reply.location}` : ''}`);
}

function parisDate(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(date);
}

function mondayOf(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const shift = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - shift);
  return date.toISOString().slice(0, 10);
}

async function publicChecks(): Promise<void> {
  for (const base of [BASE, OLD_BASE]) {
    for (const path of ['/unlock', '/legal/privacy', '/legal/account-deletion', '/recover', '/manifest.json']) {
      const reply = await call('GET', path, undefined, base);
      if (reply.status === 200) record('ok', `public ${base.replace('https://', '')}${path}`);
      else record('échec', `public ${base.replace('https://', '')}${path}`, String(reply.status));
    }
  }
  const manifest = await call('GET', '/manifest.json');
  const name = field(manifest.body, 'name');
  record(name === 'Aars' ? 'ok' : 'échec', 'manifeste au nom Aars', String(name));
  await expectStatus('API fermée sans session', 'GET', '/api/today', 401);
  const home = await call('GET', '/');
  record(home.status >= 300 && home.status < 400 ? 'ok' : 'échec', 'accueil sans session renvoie vers la connexion', `${home.status} ${home.location ?? ''}`);
}

async function run(): Promise<void> {
  console.log(`Recette de ${BASE}\n`);
  await publicChecks();

  const email = `recette+${Date.now()}@example.com`;
  const password = `R-${crypto.randomUUID()}`;
  const created = await expectOk('inscription', 'POST', '/api/users', { email, password });
  if (created.status !== 201 || !cookie) {
    record('échec', 'session après inscription', 'pas de cookie, la suite est impossible');
    return;
  }

  try {
    await authenticatedChecks(email, password);
  } finally {
    const gone = await call('DELETE', '/api/account', { password });
    record(gone.status === 200 || gone.status === 204 ? 'ok' : 'échec', 'suppression du compte de recette', String(gone.status));
    const after = await call('GET', '/api/me');
    record(after.status === 401 ? 'ok' : 'échec', 'compte supprimé, session fermée', String(after.status));
  }
}

async function authenticatedChecks(email: string, password: string): Promise<void> {
  const today = parisDate();
  const monday = mondayOf(today);

  await expectOk('identité (me)', 'GET', '/api/me');
  await expectOk('profil enregistré', 'PUT', '/api/profile', {
    sex: 'female',
    birthDate: '1995-06-15',
    heightCm: 168,
    weightKg: 64,
    bodyFatPercent: null,
    activity: 'moderate',
    goal: 'maintain',
    ratePercentPerWeek: 0,
    manualTargetKcal: null,
  });
  await expectOk('profil relu', 'GET', '/api/profile');

  // Journal : recherche CIQUAL, ajout, lecture, raccourcis, favori, suppression.
  const search = await expectOk('recherche CIQUAL', 'GET', `/api/search?q=${encodeURIComponent('pomme')}`);
  const hits = field(search.body, 'hits');
  const hit = Array.isArray(hits) ? hits.find((item) => field(item, 'kind') === 'ciqual') : undefined;
  if (!hit) {
    record('échec', 'recherche CIQUAL', 'aucun résultat pour « pomme »');
    return;
  }
  const ref = String(field(hit, 'ref'));
  const foodName = String(field(hit, 'name'));
  const per100g = field(hit, 'per100g');
  const entry = await expectOk('ajout au journal', 'POST', '/api/entries', {
    foodLabel: foodName,
    per100g: {
      kcal: field(per100g, 'kcal'),
      proteinG: field(per100g, 'proteinG'),
      carbsG: field(per100g, 'carbsG'),
      fatG: field(per100g, 'fatG'),
    },
    quantityG: 150,
    sourceKind: 'ciqual',
    sourceRef: ref,
    meal: 'lunch',
    via: 'search',
  });
  await expectOk('aujourd’hui', 'GET', '/api/today');
  await expectOk('journal du jour', 'GET', `/api/journal/${today}`);
  await expectOk('historique', 'GET', '/api/history');
  const shortcutQuery = new URLSearchParams({ sourceKind: 'ciqual', sourceRef: ref, foodLabel: foodName });
  await expectOk('raccourcis de quantité', 'GET', `/api/entries/shortcuts?${shortcutQuery.toString()}`);
  await expectOk('ajout rapide', 'GET', '/api/quick-add');
  const favorite = await expectOk('favori enregistré', 'POST', '/api/favorites', { meal: 'lunch', name: 'Recette' });
  await expectOk('favoris', 'GET', '/api/favorites');
  const favoriteId = field(favorite.body, 'favorite', 'id');
  if (typeof favoriteId === 'number') await expectOk('favori supprimé', 'DELETE', `/api/favorites/${favoriteId}`);
  const entryId = field(entry.body, 'id') ?? field(entry.body, 'entry', 'id');
  if (typeof entryId === 'number') await expectOk('entrée supprimée', 'DELETE', `/api/entries/${entryId}`);
  else record('attention', 'entrée supprimée', 'identifiant absent de la réponse, non testé');
  await expectOk('pesée', 'POST', '/api/weight', { weightKg: 64.2 });

  // Cuisine : recette, panier, plan, Remplir la semaine, courses.
  const recipe = await expectOk('recette créée', 'POST', '/api/recipes', {
    action: 'create',
    name: 'Recette de test',
    servings: 2,
    steps: ['Couper', 'Servir'],
    prepMinutes: 5,
    notes: null,
    ingredients: [{ refKind: 'ciqual', refValue: ref, label: foodName, quantityG: 200, unitName: null, unitGrams: null }],
  });
  const recipeId = field(recipe.body, 'id');
  await expectOk('recettes', 'GET', '/api/recipes');
  if (typeof recipeId === 'number') {
    await expectOk('recette lue', 'GET', `/api/recipes/${recipeId}`);
    await expectOk('recette au panier', 'POST', '/api/basket', { source: 'recipe', weekStart: monday, recipeId, servings: 2 });
    await expectOk('recette au plan', 'POST', '/api/plan', { planDate: today, meal: 'dinner', recipeId, servings: 1 });
  }
  await expectOk('panier', 'GET', `/api/basket?weekStart=${monday}`);
  await expectOk('plan', 'GET', `/api/plan?from=${monday}`);
  const auto = await call('POST', '/api/plan/auto', { weekStart: monday });
  record(auto.status < 300 ? 'ok' : 'échec', 'Remplir la semaine (gratuit, vente fermée)', `${auto.status} ${auto.text.slice(0, 120)}`);
  await expectOk('liste de courses générée', 'POST', '/api/shopping', { from: monday });
  await expectOk('liste de courses', 'GET', `/api/shopping?from=${monday}`);
  const billing = await expectOk('achats', 'GET', '/api/billing');
  const salesOpen = field(billing.body, 'products', 'salesOpen');
  const premium = field(billing.body, 'premium');
  record(salesOpen === false && premium === true ? 'ok' : 'échec', 'vente fermée, tout ouvert', `salesOpen=${String(salesOpen)} premium=${String(premium)}`);

  // Sport : lectures, séance libre ouverte puis supprimée (jamais partagée).
  await expectOk('sport, accueil', 'GET', '/api/training/home');
  await expectOk('exercices', 'GET', '/api/training/exercises');
  await expectOk('préférences sport', 'GET', '/api/training/preferences');
  await expectOk('progression', 'GET', '/api/training/progress?period=30');
  const session = await call('POST', '/api/training/sessions', { templateId: null, free: true });
  const sessionId = field(session.body, 'id');
  record(typeof sessionId === 'number' ? 'ok' : 'échec', 'séance libre démarrée', `${session.status} ${session.text.slice(0, 120)}`);
  if (typeof sessionId === 'number') {
    await expectOk('séance lue', 'GET', `/api/training/sessions/${sessionId}`);
    const dropped = await call('DELETE', `/api/training/sessions/${sessionId}`);
    record(dropped.status < 300 ? 'ok' : 'échec', 'séance supprimée', String(dropped.status));
  }

  // Communauté : lectures seulement, aucun profil créé.
  await expectOk('Communauté, accueil', 'GET', '/api/social/home');
  await expectOk('Communauté, fil', 'GET', '/api/social/feed');

  // Compte : code de secours, export, déconnexion, reconnexion.
  const code = await call('POST', '/api/account/recovery-code');
  record(code.status < 300 && typeof field(code.body, 'code') === 'string' ? 'ok' : 'échec', 'code de secours', String(code.status));
  const exported = await expectOk('export des données', 'GET', '/api/account/export');
  const format = field(exported.body, 'format');
  record(format === 'aars-export-1' ? 'ok' : 'échec', 'format de l’export', String(format));

  // Sources extérieures : un échec ici vient souvent d'elles, d'où « attention ».
  const off = await call('GET', `/api/off/search?q=${encodeURIComponent('nutella')}`);
  record(off.status === 200 ? 'ok' : 'attention', 'recherche Open Food Facts', String(off.status));
  // `/resolve` : cache produits puis Open Food Facts, comme le scanner. Le
  // produit trouvé entre au cache commun, qui n'a rien de personnel.
  const product = await call('GET', '/api/products/3017620422003/resolve');
  record(product.status === 200 ? 'ok' : 'attention', 'code-barres (Nutella)', String(product.status));
  const imported = await call('POST', '/api/recipes/import', {
    url: 'https://www.marmiton.org/recettes/recette_pate-a-crepes-des-plus-faciles_27121.aspx',
  });
  record(imported.status === 200 ? 'ok' : 'attention', 'import de recette par lien', `${imported.status} ${imported.text.slice(0, 120)}`);

  // Toutes les pages de la PWA, rendues pour ce compte.
  const pages = [
    '/', '/welcome', '/add', '/add/favorites', '/add/manual', '/add/photo', '/add/recipe', '/add/scan', '/add/search',
    '/history', `/history/${today}`, '/kitchen', '/kitchen/catalog', '/kitchen/recipes', '/kitchen/recipes/new',
    '/kitchen/shopping', '/me', '/profile', '/settings', '/settings/appearance', '/settings/health',
    '/settings/install', '/training', '/training/community', '/training/community/people', '/training/compose',
    '/training/import', '/training/preferences', '/training/progress',
  ];
  if (typeof recipeId === 'number') {
    pages.push(`/kitchen/recipes/${recipeId}`, `/kitchen/recipes/${recipeId}/cook`, `/kitchen/recipes/${recipeId}/edit`);
  }
  for (const path of pages) await expectPage(path);

  await expectOk('déconnexion', 'DELETE', '/api/session');
  cookie = '';
  await expectOk('reconnexion', 'POST', '/api/session', { email, password });
}

run()
  .catch((error: unknown) => record('échec', 'le script s’est arrêté', String(error)))
  .finally(() => {
    const failed = results.filter((item) => item.outcome === 'échec');
    const warned = results.filter((item) => item.outcome === 'attention');
    console.log(`\n${results.length - failed.length - warned.length} ok, ${warned.length} attention, ${failed.length} échec(s)`);
    process.exitCode = failed.length > 0 ? 1 : 0;
  });
