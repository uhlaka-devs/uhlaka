/**
 * Colour palettes in a real browser (ADR 0083): a palette chosen in Design,
 * its light and its dark on the page, the colours from before brought back,
 * and a palette made from the owner's own colour. Checked by what the canvas
 * painted, not by what the panel said.
 *
 *   node e2e/palettes.cjs [folder for screenshots]
 */
const { chromium } = require('playwright');
const coverage = require('./coverage.cjs');
const { spawn, execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const root = join(__dirname, '..');
const cli = (...args) => execFileSync('bun', ['src/site/cli.ts', ...args], { cwd: root, encoding: 'utf8' });
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`ok  ${message}`);
};

// Plain's own background (themes/plain.json), and Forest's light and dark ones (src/core/palettes.ts).
const PLAIN = 'rgb(255, 255, 255)';
const FOREST_LIGHT = 'rgb(246, 248, 244)';
const FOREST_DARK = 'rgb(13, 21, 16)';

(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'uhlaka-e2e-'));
  const db = join(dir, 'site.db');
  const shots = process.argv[2];
  cli('init', db);

  const server = spawn('bun', ['src/site/cli.ts', 'edit', db, '4398'], { cwd: root });
  const url = await new Promise((resolve, reject) => {
    let out = '';
    server.stdout.on('data', (chunk) => {
      out += chunk;
      const found = out.match(/http:\/\/127\.0\.0\.1:\d+\/admin\/#token=\w+/);
      if (found) resolve(found[0]);
    });
    server.stderr.on('data', (chunk) => process.stderr.write(chunk));
    server.on('exit', () => reject(new Error('the editor stopped')));
  });
  const site = new URL('/', url).href;

  const browser = await coverage.launch(chromium, 'palettes');
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: shots ? 2 : 1, colorScheme: 'light' });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const canvas = page.frameLocator('iframe');
    const painted = () => page.evaluate(() => getComputedStyle(document.querySelector('iframe').contentDocument.body).backgroundColor);
    const paints = (value) => page.waitForFunction((v) => getComputedStyle(document.querySelector('iframe').contentDocument.body).backgroundColor === v, value);
    await page.goto(url);
    await page.locator('[data-open=""]').first().click();
    await canvas.locator('h1').waitFor();
    assert((await painted()) === PLAIN, 'a new site starts with Plain\'s colours');

    await page.locator('[data-design-mode]').click();
    const palettes = page.locator('[data-palettes]');
    await palettes.waitFor();
    assert((await palettes.locator('[data-palette]').count()) === 8, 'Design → Style offers the palettes');
    assert((await palettes.locator('[aria-pressed="true"]').count()) === 0, 'none is in use on Plain, whose colours are its own');

    await palettes.locator('[data-palette="forest"]').click();
    await paints(FOREST_LIGHT);
    assert(true, 'a click puts the palette on the page at once');
    assert(await palettes.locator('[data-palette="forest"][aria-pressed="true"]').isVisible(), 'and its card says it is in use');
    assert(await page.locator('[data-palette-applied]').isVisible(), 'the panel says what changed and what stays');
    assert((await page.locator('[data-token="color.primary"]').inputValue()) === '#1f6b3a', 'its colours are in the fields below, to change');
    if (shots) await page.screenshot({ path: join(shots, 'palettes-light.png') });
    await page.locator('[data-preview-scheme="dark"]').click();
    await paints(FOREST_DARK);
    assert(true, 'and its dark colours are the dark of the page');
    if (shots) await page.screenshot({ path: join(shots, 'palettes-dark.png') });
    await page.locator('[data-preview-scheme="light"]').click();
    await page.locator('[data-theme-schemes] summary').click();
    assert(await page.locator('[data-contrast="ok"]').isVisible(), 'every text reads well, in both schemes');

    // A colour changed by hand: no palette is in use any more.
    await page.locator('[data-token="color.primary"]').fill('#0a5c2b');
    await palettes.locator('[aria-pressed="true"]').waitFor({ state: 'detached' });
    assert(true, 'a colour changed by hand: the palette is no longer marked in use');

    await page.locator('[data-palette-undo]').click();
    await paints(PLAIN);
    assert((await page.locator('[data-token="color.primary"]').inputValue()) === '#2563eb', 'the colours from before come back with one click');
    assert(!(await page.locator('[data-palette-undo]').count()), 'and the button goes');

    // A palette from the owner's own colour.
    await page.locator('[data-palette-color]').fill('#c2185b');
    await page.locator('[data-palette-make]').click();
    await page.waitForFunction(() => document.querySelector('[data-token="color.primary"]')?.value !== '#2563eb');
    const made = await page.locator('[data-token="color.primary"]').inputValue();
    assert(/^#[0-9a-f]{6}$/.test(made) && made !== '#2563eb', `a palette is made from the owner\'s colour (${made})`);
    assert(await page.locator('[data-contrast="ok"]').isVisible(), 'and reads well, in both schemes');
    if (shots) await palettes.screenshot({ path: join(shots, 'palettes-panel.png') });

    assert(errors.length === 0, `no errors in the console${errors.length ? `: ${errors.join('; ')}` : ''}`);
  } finally {
    await browser.close();
    server.kill();
    rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
