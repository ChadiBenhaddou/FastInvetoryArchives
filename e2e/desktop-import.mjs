// Desktop admin, end to end against the running stack: login → register device →
// drag & drop a phone export on the Import page → report.
// Usage: scripts/e2e-desktop.(ps1|sh)  (env: APP_URL, ADMIN_USER, ADMIN_PASSWORD, ZIP)
import { chromium } from 'playwright';

const URL = process.env.APP_URL ?? 'http://archive-inventory-gateway-1';
const ZIP = process.env.ZIP;
const OUT = process.env.OUT_DIR ?? '/tmp';

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const fail = async (msg) => {
    await page.screenshot({ path: `${OUT}/desktop-failure.png`, fullPage: true }).catch(() => {});
    console.error(`FAILED: ${msg}\nPAGE ERRORS: ${JSON.stringify(errors)}`);
    process.exit(1);
};
process.on('uncaughtException', (e) => fail(e.message));
const step = (m) => console.log(`- ${m}`);

step('login');
await page.goto(`${URL}/login`);
await page.getByLabel('Identifiant').fill(process.env.ADMIN_USER ?? 'admin');
await page.getByLabel('Mot de passe').fill(process.env.ADMIN_PASSWORD);
await page.getByRole('button', { name: 'Se connecter' }).click();
await page.getByRole('heading', { name: 'Tableau de bord' }).waitFor();

step('register device A');
await page.getByRole('link', { name: 'Appareils' }).click();
await page.getByRole('heading', { name: 'Appareils' }).waitFor();
// Wait for the list to load (a device row or the empty message) before deciding.
await page.locator('tbody tr').first().waitFor();
await page.waitForFunction(() => !document.querySelector('tbody')?.innerText.includes('Chargement'));
if (!(await page.locator('td', { hasText: /^A$/ }).count())) {
    await page.locator('select').selectOption('A');
    await page.getByPlaceholder(/Nom/).fill('Téléphone de test');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.locator('td', { hasText: /^A$/ }).waitFor();
}

step('import page: drop the ZIP');
await page.getByRole('link', { name: 'Import' }).click();
await page.getByText('Déposer ici').waitFor();
await page.getByText(/sont importés automatiquement/).waitFor();
await page.locator('input[type=file]').setInputFiles(ZIP);

step('wait for the import to finish');
const badge = page.locator('li span.rounded-full').first();
await page.waitForFunction(
    () => {
        const t = document.querySelector('li span.rounded-full')?.textContent ?? '';
        return t && !['En attente', 'En cours'].includes(t);
    },
    null,
    { timeout: 120000 },
);
const status = await badge.innerText();
const summary = await page.locator('li').first().innerText();
console.log(`  status: ${status}\n  ${summary.replace(/\n/g, ' | ')}`);
if (!['Terminé', 'Déjà importé', 'Terminé avec anomalies'].includes(status)) await fail(`unexpected status ${status}`);

step('open the report');
await page.locator('li').first().getByRole('button', { name: 'Voir le rapport' }).click();
await page.getByRole('heading', { name: /Rapport d'import/ }).waitFor();
await page.screenshot({ path: `${OUT}/desktop-import-report.png`, fullPage: true });
const reportText = await page.locator('.fixed').innerText();
console.log(reportText.split('\n').filter(Boolean).slice(0, 30).map((l) => `  | ${l}`).join('\n'));
await page.getByRole('button', { name: 'Fermer' }).click();
await page.screenshot({ path: `${OUT}/desktop-import-page.png`, fullPage: true });

if (errors.length) await fail('console errors');
console.log('DESKTOP IMPORT TEST PASSED');
await browser.close();
