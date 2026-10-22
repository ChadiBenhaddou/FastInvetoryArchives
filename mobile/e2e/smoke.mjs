// End-to-end smoke test of the web build in headless Chromium with a fake camera:
// setup → box with photos → close → voided box → export → checks the ZIP.
// Run with scripts/e2e-mobile.(ps1|sh). Writes the ZIP to $OUT_DIR for the PC import tests.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';

const URL = process.env.APP_URL ?? 'http://localhost:4173';
const OUT_DIR = process.env.OUT_DIR ?? '/tmp';
const PHOTOS_PER_BOX = 3;
// Generous: the first document photo may wait for OpenCV to compile on a slow CI machine.
const PHOTO_TIMEOUT = 120_000;

const browser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const context = await browser.newContext({ acceptDownloads: true, permissions: ['camera'], viewport: { width: 412, height: 915 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
process.on('uncaughtException', async (e) => {
    console.error(e);
    console.error('PAGE ERRORS:', errors);
    console.error('VISIBLE TEXT:', await page.evaluate(() => document.body.innerText).catch(() => '?'));
    console.error('BUTTONS:', await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => `${b.getAttribute('aria-label') ?? b.textContent}${b.disabled ? ' [disabled]' : ''}`)).catch(() => '?'));
    await page.screenshot({ path: `${OUT_DIR}/failure.png` }).catch(() => {});
    process.exit(1);
});

const button = (name) => page.getByRole('button', { name, exact: false });
const step = (msg) => console.log(`- ${msg}`);

await page.goto(URL);

step('setup');
await page.getByText('Configuration du téléphone').waitFor();
await page.locator('input').first().fill('Agent Test');
await page.getByRole('button', { name: 'A', exact: true }).click();
await page.locator('input[type=password]').nth(0).fill('123456');
await page.locator('input[type=password]').nth(1).fill('123456');
await button('Terminer la configuration').click();

async function shootPhotos(count) {
    for (let i = 0; i < count; i++) {
        const before = await page.locator('text=/^\\d+ photos$/').first().innerText().catch(() => '');
        const started = Date.now();
        await page.getByRole('button', { name: 'Photo', exact: true }).click();
        // The fake camera image may be judged blurry: keep it anyway (tests the override path).
        const keep = button('Garder quand même');
        await Promise.race([
            keep.waitFor({ timeout: PHOTO_TIMEOUT }).then(() => keep.click()),
            page.waitForFunction((b) => document.body.innerText.match(/(\d+) photos/)?.[0] !== b.trim(), before, { timeout: PHOTO_TIMEOUT }),
        ]);
        await page.waitForFunction(() => document.querySelector('button[aria-label="Photo"]')?.disabled === false, null, { timeout: PHOTO_TIMEOUT });
        console.log(`  photo processed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    }
}

step('box 1: generate code');
await button('Nouvelle boîte').click();
await page.locator('input').first().fill('Salle 1');
await button('Générer le code').click();
const code1 = (await page.locator('span[dir=ltr].font-mono').first().innerText()).trim();
console.log(`  code ${code1}`);
await button("C'est écrit").click();

step(`box 1: ${PHOTOS_PER_BOX} photos (code + documents)`);
await shootPhotos(PHOTOS_PER_BOX);
await page.waitForFunction((n) => document.body.innerText.includes(`${n} photos`), PHOTOS_PER_BOX);

step('box 1: delete last photo, retake it');
await page.getByRole('button', { name: 'Supprimer la dernière photo' }).click();
await button('Confirmer').click();
await page.waitForFunction((n) => document.body.innerText.includes(`${n} photos`), PHOTOS_PER_BOX - 1);
await shootPhotos(1);

step('box 1: close');
await button('Terminer').click();
await button('Fermer la boîte').click();
await button('Confirmer').click();
await page.getByText(`Boîte ${code1} fermée`).waitFor();
await page.getByRole('button', { name: 'Fermer', exact: true }).click();

step('box 2: create then void');
await button('Nouvelle boîte').click();
await button('Générer le code').click();
const code2 = (await page.locator('span[dir=ltr].font-mono').first().innerText()).trim();
await button("C'est écrit").click();
await button('Terminer').click();
await button('Annuler cette boîte').click();
await button('Confirmer').click();

step('export');
await button('Exporter').click();
const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
await button("Créer le fichier d'export").click();
const download = await downloadPromise;
await page.getByText('1 boîte(s) / 3 photo(s) exportées.').waitFor();
const fileName = download.suggestedFilename();
mkdirSync(OUT_DIR, { recursive: true });
const zipPath = `${OUT_DIR}/${fileName}`;
await download.saveAs(zipPath);
console.log(`  ${fileName}`);

step('verify ZIP');
const { readFileSync } = await import('node:fs');
const files = unzipSync(new Uint8Array(readFileSync(zipPath)));
const manifest = JSON.parse(strFromU8(files['manifest.json']));
const assert = (cond, msg) => {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
};
assert(/^A_\d{8}_\d{4}_1boxes\.zip$/.test(fileName), `file name ${fileName}`);
assert(manifest.format_version === 1 && manifest.device_letter === 'A' && manifest.agent_name === 'Agent Test', 'header');
assert(manifest.boxes.length === 1 && manifest.boxes[0].code === code1, 'box list');
assert(manifest.boxes[0].location.room === 'Salle 1', 'location');
assert(JSON.stringify(manifest.voided_sequences) === JSON.stringify([2]) && code2.startsWith('A-0002-'), 'voided');
assert(manifest.sequence_range.from === 1 && manifest.sequence_range.to === 1 && manifest.sequence_range.last_issued === 2, 'range');
const photos = manifest.boxes[0].photos;
assert(photos.length === PHOTOS_PER_BOX, 'photo count');
assert(photos[0].type === 'code_photo' && photos[0].file === `boxes/${code1}/000_code.jpg`, 'code photo');
for (const p of photos) {
    const data = files[p.file];
    assert(data, `missing ${p.file}`);
    assert(createHash('sha256').update(data).digest('hex') === p.sha256, `checksum ${p.file}`);
    assert(Math.max(p.width, p.height) <= 2000, `size ${p.file}`);
    assert(data[0] === 0xff && data[1] === 0xd8, `not a JPEG ${p.file}`);
}
assert(Object.keys(files).length === PHOTOS_PER_BOX + 1, 'no extra files in ZIP');

step('Arabic / RTL');
await page.goto(URL);
await page.getByRole('button', { name: 'Réglages' }).click();
await page.locator('input[type=password]').fill('123456');
await button('Confirmer').click();
await page.getByRole('button', { name: 'العربية' }).click();
assert((await page.evaluate(() => document.documentElement.dir)) === 'rtl', 'rtl');
await page.screenshot({ path: `${OUT_DIR}/screen-admin-ar.png` });

writeFileSync(`${OUT_DIR}/manifest-sample.json`, JSON.stringify(manifest, null, 2));
const unexpected = errors.filter((e) => !/Auto-crop skipped/.test(e));
assert(unexpected.length === 0, `page errors: ${unexpected.join(' | ')}`);
console.log('SMOKE TEST PASSED');
await browser.close();
