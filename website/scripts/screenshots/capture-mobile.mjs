// Real screenshots of the Android capture app (its web build, mobile/dist) for the website.
// Same steps as mobile/e2e/smoke.mjs, with a sample document photo as the fake camera (sample data only,
// never real archives). Writes PNGs to website/src/assets/screenshots/mobile/.
//
//   npm run build in mobile/ first if mobile/src changed (mobile/dist must be current), then:
//   node scripts/screenshots/capture-mobile.mjs
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const REPO = resolve(import.meta.dirname, '../../..');
const DIST = join(REPO, 'mobile/dist');
const SAMPLE = join(REPO, 'samples/K_20261022_1800_3boxes_exemple.zip');
const OUT = join(REPO, 'website/src/assets/screenshots/mobile');
const PORT = 4179;

/** One entry of a ZIP file (stored or deflated), enough for the sample export. */
function readZipEntry(zipPath, name) {
    const buf = readFileSync(zipPath);
    let eocd = buf.length - 22;
    while (buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
    let p = buf.readUInt32LE(eocd + 16);
    for (let i = 0; i < buf.readUInt16LE(eocd + 10); i++) {
        const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32);
        const local = buf.readUInt32LE(p + 42);
        if (buf.toString('utf8', p + 46, p + 46 + nameLen) === name) {
            const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
            const data = buf.subarray(start, start + size);
            return method === 0 ? data : inflateRawSync(data);
        }
        p += 46 + nameLen + extra + comment;
    }
    throw new Error(`${name} not in ${zipPath}`);
}

if (!existsSync(join(DIST, 'index.html'))) throw new Error('mobile/dist missing: run "npm run build" in mobile/');

// Fake camera: an MJPEG "video" made of the same sample page, repeated.
const page1 = readZipEntry(SAMPLE, 'boxes/K-0001-A/001.jpg');
const camera = join(tmpdir(), 'archive-sample-camera.mjpeg');
writeFileSync(camera, Buffer.concat(Array(30).fill(page1)));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
    let file = join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
}).listen(PORT);

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${camera}`],
});
const context = await browser.newContext({ permissions: ['camera'], viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, locale: 'fr-FR' });
const page = await context.newPage();
const button = (name) => page.getByRole('button', { name, exact: false });
const shot = async (name) => {
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    console.log(`  ${name}.png`);
};

try {
    await page.goto(`http://localhost:${PORT}/`);
    await page.getByText('Configuration du téléphone').waitFor();
    await page.locator('input').first().fill('Agent Exemple');
    await page.getByRole('button', { name: 'K', exact: true }).click();
    await page.locator('input[type=password]').nth(0).fill('123456');
    await page.locator('input[type=password]').nth(1).fill('123456');
    await shot('01-configuration');
    await button('Terminer la configuration').click();
    await page.getByRole('button', { name: 'Nouvelle boîte' }).waitFor();
    await shot('02-accueil');

    await button('Nouvelle boîte').click();
    await page.locator('input').first().fill('Salle 3');
    await page.locator('input').nth(1).fill('Étagère B');
    await button('Générer le code').click();
    await page.locator('span[dir=ltr].font-mono').first().waitFor();
    await shot('03-code-genere');
    await button("C'est écrit").click();
    await page.getByRole('button', { name: 'Photo', exact: true }).waitFor();
    await page.waitForTimeout(2500); // camera stream up
    await shot('04-prise-de-vue');

    for (let i = 0; i < 3; i++) {
        const before = await page.locator('text=/^\\d+ photos?$/').first().innerText().catch(() => '');
        await page.getByRole('button', { name: 'Photo', exact: true }).click();
        const keep = button('Garder quand même');
        await Promise.race([
            keep.waitFor({ timeout: 120_000 }).then(async () => {
                if (i === 1) await shot('05-controle-qualite');
                await keep.click();
            }),
            page.waitForFunction((b) => document.body.innerText.match(/(\d+) photos?/)?.[0] !== b.trim(), before, { timeout: 120_000 }),
        ]);
        await page.waitForFunction(() => document.querySelector('button[aria-label="Photo"]')?.disabled === false, null, { timeout: 120_000 });
    }
    await shot('06-boite-en-cours');
    await button('Terminer').click();
    await shot('07-terminer-boite');
    await button('Fermer la boîte').click();
    await button('Confirmer').click();
    await page.getByRole('button', { name: 'Fermer', exact: true }).click();

    await button('Exporter').click();
    await page.getByText("Créer le fichier d'export").waitFor();
    await shot('08-export');

    await page.goto(`http://localhost:${PORT}/`);
    await page.getByRole('button', { name: 'Réglages' }).click();
    await page.locator('input[type=password]').fill('123456');
    await button('Confirmer').click();
    await page.getByRole('button', { name: 'العربية' }).click();
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => document.documentElement.dir === 'rtl');
    await shot('09-accueil-arabe');
} finally {
    await browser.close();
    server.close();
}
