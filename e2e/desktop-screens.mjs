// Desktop admin screens, end to end against the running stack (deliverable 6):
// dashboard → boxes → box detail → correction → search (AR/FR) → export → PIN → backup → conflicts.
// Usage: scripts/e2e-desktop.(ps1|sh) -Script desktop-screens.mjs
import { chromium } from 'playwright';

const URL = process.env.APP_URL ?? 'http://archive-inventory-gateway-1';
const OUT = process.env.OUT_DIR ?? '/tmp';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const fail = async (msg) => {
    await page.screenshot({ path: `${OUT}/screens-failure.png`, fullPage: true }).catch(() => {});
    console.error(`FAILED: ${msg}\nPAGE ERRORS: ${JSON.stringify(errors)}`);
    process.exit(1);
};
process.on('uncaughtException', (e) => fail(e.message));
const step = (m) => console.log(`- ${m}`);
const shot = (name) => page.screenshot({ path: `${OUT}/screen-${name}.png`, fullPage: true });
const nav = (label) => page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click();

step('login');
await page.goto(`${URL}/login`);
await page.getByLabel('Identifiant').fill(process.env.ADMIN_USER ?? 'admin');
await page.getByLabel('Mot de passe').fill(process.env.ADMIN_PASSWORD);
await page.getByRole('button', { name: 'Se connecter' }).click();
await page.getByRole('heading', { name: 'Tableau de bord', level: 1 }).waitFor();
await page.getByText('Photos par agent et par jour').waitFor();
await page.waitForTimeout(1500);
await shot('dashboard');

step('boxes list + filters');
await nav('Boîtes');
await page.getByRole('heading', { name: 'Boîtes', exact: true, level: 1 }).waitFor();
await page.locator('tbody tr').first().waitFor();
const rows = await page.locator('tbody tr').count();
console.log(`  ${rows} box(es) listed`);
await shot('boxes');

step('box detail + document form');
await page.getByRole('link', { name: 'K-0001-A' }).click();
await page.getByText('Code enregistré').waitFor();
await page.locator('button:has(img)').first().click();
await page.getByText('Texte lu (OCR)').waitFor();
const title = await page.getByLabel('Titre / objet').inputValue().catch(() => '');
console.log(`  first document title: ${title || '(vide)'}`);
await shot('box-detail');

step('correction from the box page (no validation step)');
await page.getByLabel('Titre / objet').fill(`${title || 'Document'} (corrigé)`);
await page.getByRole('button', { name: 'Enregistrer la correction' }).click();
await page.getByText('Correction enregistrée.').waitFor({ timeout: 15000 });
await page.getByText(/Corrigé par/).waitFor({ timeout: 15000 });
console.log('  correction saved, document no longer flagged');
await shot('correction');

step('search (Arabic, with highlight)');
await nav('Recherche');
await page.getByPlaceholder(/Mots, nom/).fill('الداخلية');
await page.getByRole('button', { name: 'Chercher' }).click();
await page.locator('mark').first().waitFor({ timeout: 15000 });
console.log(`  ${await page.locator('text=/\\d+ document\\(s\\)/').innerText()}`);
await shot('search-ar');
await page.getByPlaceholder(/Mots, nom/).fill('nomination Benali');
await page.getByRole('button', { name: 'Chercher' }).click();
await page.locator('mark').first().waitFor({ timeout: 15000 });
await shot('search-fr');

step('Excel export');
const res = await page.request.get(`${URL}/api/export?format=xlsx`);
if (res.status() !== 200 || !(res.headers()['content-disposition'] ?? '').includes('.xlsx')) await fail(`export ${res.status()}`);
console.log(`  ${(await res.body()).length} bytes`);

step('device PIN');
await nav('Appareils');
const row = page.locator('tr', { has: page.locator('td', { hasText: /^K$/ }) });
page.once('dialog', (d) => d.accept()); // "Générer un nouveau code PIN ?" when one exists
await row.getByRole('button', { name: /Générer|Nouveau/ }).click();
await row.locator('text=/^\\d{6}$/').waitFor({ timeout: 10000 });
console.log(`  PIN shown: ${await row.locator('text=/^\\d{6}$/').innerText()}`);

step('backup');
await nav('Sauvegarde');
await page.getByRole('button', { name: 'Sauvegarder maintenant' }).click();
await page.locator('td', { hasText: 'Terminée' }).first().waitFor({ timeout: 300000 });
await shot('backup');

step('conflicts');
await nav('Conflits');
await page.getByRole('heading', { name: 'Conflits de codes', level: 1 }).waitFor();
if (await page.locator('li button').count()) {
    await page.locator('li button').first().click();
    await page.getByText('Reçu dans le nouvel import').waitFor();
    await shot('conflict');
}

const unexpected = errors.filter((e) => !/favicon/.test(e));
if (unexpected.length) await fail('console errors');
console.log('DESKTOP SCREENS TEST PASSED');
await browser.close();
