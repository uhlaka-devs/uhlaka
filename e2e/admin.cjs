/**
 * The corners of the admin, in a real browser: what the other end-to-end
 * tests pass by. Opening it without its key, a server that fails, groups
 * nested too deep, a block's variant and its own style, copying and deleting
 * a block, deleting a page, uploading to the media library, a visitor's
 * messages exported and erased, every kind of field an entry can have, and
 * the admin in another language.
 *
 *   node e2e/admin.cjs [folder for screenshots]
 */
const { chromium } = require('playwright');
const coverage = require('./coverage.cjs');
const { spawn, execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { deflateSync } = require('node:zlib');

const root = join(__dirname, '..');
const cli = (...args) => execFileSync('bun', ['src/site/cli.ts', ...args], { cwd: root, encoding: 'utf8' });
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`ok  ${message}`);
};
const PORT = 4396;

/** A small PNG, one colour, made here so the test needs no file. */
function png(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x80)]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0))]);
}

(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'uhlaka-e2e-admin-'));
  const db = join(dir, 'site.db');
  const shots = process.argv[2];
  cli('init', db);
  cli('theme', db, join(root, 'themes', 'studio.json'));
  // A type with every kind of field, an entry of it, and two messages from one visitor.
  execFileSync(
    'bun',
    [
      '-e',
      `import { Store } from './src/site/store.ts';
       const store = await Store.open(${JSON.stringify(db)});
       const site = await store.site();
       await store.setSite({ ...site, types: [...(site.types ?? []), { id: 'events', name: 'Events', singular: 'Event', path: 'events', comments: true, fields: [
         { key: 'where', label: 'Where', kind: 'text' }, { key: 'about', label: 'About', kind: 'longtext' }, { key: 'on', label: 'On', kind: 'date' },
         { key: 'tickets', label: 'Tickets', kind: 'link' }, { key: 'poster', label: 'Poster', kind: 'image' } ] }] });
       await store.saveEntry('events', { slug: 'open-day', title: 'Open day', blocks: [] });
       await store.addMessage({ form: 'b_x', page: '/contact/', name: 'Ana', email: 'ana@example.org', body: 'First', consent: 'c' });
       await store.addMessage({ form: 'b_x', page: '/contact/', name: 'Ana', email: 'ana@example.org', body: 'Second', consent: 'c' });
       await store.addComment({ type: 'events', entry: 'open-day', name: 'Ana', email: 'ana@example.org', body: 'See you there', consent: 'c' });
       await store.addComment({ type: 'events', entry: 'open-day', name: 'Bot', email: 'bot@example.org', body: 'Cheap watches', consent: 'c' });
       await store.close();`,
    ],
    { cwd: root },
  );

  const server = spawn('bun', ['src/site/cli.ts', 'edit', db, String(PORT)], { cwd: root });
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

  const browser = await coverage.launch(chromium, 'admin');
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const canvas = page.frameLocator('iframe');
    const saved = () => page.locator('.status[data-state="saved"]').waitFor();
    const alert = () => page.locator('[role="alert"]').first();
    /** Every change the admin sends fails, as when the server is gone; reading still works. */
    const serverDown = () =>
      page.route('**/api/**', (route) =>
        route.request().method() === 'GET' ? route.fallback() : route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'the server is down' }) }),
      );

    // Without the key, the admin says where to find it.
    await page.goto(url.replace(/#.*$/, ''));
    await page.getByText('it carries the key to this editor').waitFor();
    assert(true, 'without its key the admin says to open the address the command printed');
    await page.goto(url.replace(/token=\w+/, 'token=wrong'));
    await page.reload();
    await page.getByText('no token').waitFor();
    assert(true, 'with a wrong key it says what the server answered');
    await page.goto(url);
    await page.reload();

    // A new page, and groups nested as deep as they go.
    await page.locator('[data-new="page"]').click();
    await page.getByPlaceholder('Page title').fill('Corners');
    await page.getByRole('button', { name: 'Create' }).click();
    await canvas.locator('[data-empty="page"]').waitFor();
    // "Add a block" in groups, with a search (ADR 0073).
    assert((await page.locator('[data-block-group]').count()) >= 6, 'the blocks are offered in groups');
    await page.locator('[data-block-search]').fill('youtube');
    assert((await page.locator('[data-add]').count()) === 1 && (await page.locator('[data-add="embed"]').isVisible()), 'a block is found by another word for it');
    await page.locator('[data-block-search]').fill('nothing like this');
    await page.locator('[data-no-block]').waitFor();
    assert(true, 'a search that finds nothing says so');
    await page.locator('[data-block-search]').fill('');
    await page.locator('[data-add="hero"]').click();
    await canvas.locator('.b-hero').waitFor();
    await saved();

    // The hero's variant, from the theme, and a value of its own, which can be put back to the theme's.
    await page.getByRole('tab', { name: 'Style' }).click();
    await page.getByLabel('Variant').selectOption('bold');
    await canvas.locator('.b-hero.v-bold').waitFor();
    await saved();
    assert(true, 'a variant the theme gives a block can be chosen');
    await page.locator('[data-style="paddingBlock"]').selectOption('$custom');
    await page.locator('[data-custom="paddingBlock"]').fill('3rem');
    await page.getByRole('button', { name: 'Reset to the style' }).waitFor();
    await saved();
    assert(await page.locator('.own').first().isVisible(), "a value of the block's own is marked");
    await page.getByRole('button', { name: 'Reset to the style' }).click();
    await saved();
    assert((await page.locator('.own').count()) === 0, "and can be put back to the theme's");

    // Copy a block, then delete the copy, from the bar on the canvas.
    await page.getByRole('tab', { name: 'Content' }).click();
    await canvas.locator('.b-hero').first().click({ position: { x: 5, y: 5 } });
    await canvas.locator('[data-action="duplicate"]').click();
    await canvas.locator('.b-hero').nth(1).waitFor();
    await saved();
    assert((await canvas.locator('.b-hero').count()) === 2, 'a block can be copied');
    await canvas.locator('[data-action="delete"]').click();
    await canvas.locator('.b-hero').nth(1).waitFor({ state: 'detached' });
    await saved();
    assert((await canvas.locator('.b-hero').count()) === 1, 'and the copy deleted');

    for (let i = 0; i < 4; i++) {
      await page.locator('[data-add="group"]').click();
      await saved();
    }
    await page.locator('[data-add="group"]').click();
    await page.getByText('Groups nest at most four deep').waitFor();
    assert(true, 'a group cannot be put deeper than four');
    if (shots) await page.screenshot({ path: join(shots, 'admin-too-deep.png') });

    // When the server fails, the admin says so and keeps what was typed.
    await serverDown();
    await canvas.locator('.b-hero h1').click();
    await page.keyboard.type(' again');
    await page.locator('.status[data-state="error"]').waitFor();
    assert((await page.locator('.status').innerText()).includes('the server is down'), 'a save that fails says why');
    await page.getByRole('button', { name: 'Publish' }).click();
    await page.locator('[data-design-mode]').click();
    await page.locator('[data-design-part="header"]').click();
    await page.locator('[data-design-mode]').click();
    await page.unroute('**/api/**');
    await canvas.locator('.b-hero h1').click();
    await page.keyboard.type('!');
    await saved();
    assert((await canvas.locator('.b-hero h1').innerText()).includes('again!'), 'and when it is back, what was typed is saved');

    // A page can be deleted; when that fails, the page stays.
    const deselect = () => canvas.locator('main').evaluate((main) => main.click());
    await deselect();
    await serverDown();
    await page.getByRole('button', { name: 'Delete this page' }).click();
    await alert().waitFor();
    await page.unroute('**/api/**');
    await page.getByRole('button', { name: 'Delete this page' }).click();
    await page.locator('[data-list="page"]').waitFor();
    assert((await page.locator('[data-open="corners"]').count()) === 0, 'a page can be deleted');

    // A new page that cannot be made says why.
    await serverDown();
    await page.locator('[data-new="page"]').click();
    await page.getByPlaceholder('Page title').fill('Never');
    await page.getByRole('button', { name: 'Create' }).click();
    await alert().waitFor();
    assert((await alert().innerText()).includes('the server is down'), 'a page that cannot be made says why');
    await page.unroute('**/api/**');

    // The media library: an upload, and a library that cannot be read.
    await page.locator('[data-nav="media"]').click();
    await page.locator('[data-list="media"]').waitFor();
    await page.locator('[data-library-file]').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: png(64, 48) });
    await page.locator('[data-media-item]').first().waitFor();
    assert((await page.locator('[data-media-item]').count()) >= 1, 'an image can be uploaded to the media library');
    // Its details (ADR 0072): a new name, words for people who cannot see it, what it is and where it is used.
    await page.locator('[data-media-item]', { hasText: 'sample.png' }).locator('[data-media-open]').click();
    const details = page.locator('[data-media-details]');
    await details.locator('[data-media-used]', { hasText: 'Not used on any page yet.' }).waitFor();
    assert((await details.innerText()).includes('64 × 48 px'), "a file's details say what it is and that nothing uses it");
    await details.locator('[data-media-label]').fill('Workshop sample');
    await details.locator('[data-media-alt]').fill('A grey sample of the workshop');
    await details.locator('[data-media-save]').click();
    await details.getByText('Saved.').waitFor();
    await page.locator('[data-media-item]', { hasText: 'Workshop sample' }).waitFor();
    assert(true, 'a file is renamed and a picture described from its details');
    if (shots) await page.screenshot({ path: join(shots, 'media-details.png') });
    await page.locator('[data-nav="pages"]').click();
    // Before publishing: the site is read for links that lead nowhere and pictures with no words.
    await page.locator('[data-check-run]').click();
    await page.locator('[data-check-fine], [data-check-broken], [data-check-unnamed]').first().waitFor();
    assert((await page.locator('[data-check-broken]').count()) === 0, 'the published demo has no link that leads nowhere');
    await page.route('**/api/check', (route) => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'the home page is not published' }) }));
    await page.locator('[data-check-run]').click();
    await page.locator('[data-site-check] [role="alert"]', { hasText: 'the home page is not published' }).waitFor();
    await page.unroute('**/api/check');
    await page.route('**/api/check', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ check: { broken: [{ href: '/servicii/', from: ['/', '/about/'] }], unnamed: [{ src: '/media/a.webp', on: ['/'] }] } }) }));
    await page.locator('[data-check-run]').click();
    await page.locator('[data-check-broken] li', { hasText: '/servicii/' }).waitFor();
    await page.locator('[data-check-unnamed] li', { hasText: '/media/a.webp' }).waitFor();
    if (shots) await page.screenshot({ path: join(shots, 'site-check.png'), fullPage: true });
    await page.unroute('**/api/check');
    await page.locator('[data-check-run]').click();
    await page.locator('[data-check-broken]').waitFor({ state: 'detached' });
    assert(true, 'what it finds is listed with the pages it is on, and a site that cannot be read says why');
    await page.route('**/api/media', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'no media today' }) }));
    await page.locator('[data-nav="media"]').click();
    await page.getByText('no media today').waitFor();
    assert(true, 'a library that cannot be read says why');
    await page.unroute('**/api/media');

    // Comments wait for the owner: one is approved, the other deleted.
    await page.locator('[data-nav="comments"]').click();
    await page.locator('[data-list="comments"] [data-comment]').nth(1).waitFor();
    const ana = page.locator('[data-comment]', { hasText: 'See you there' });
    assert((await ana.getAttribute('data-approved')) === 'no' && (await ana.textContent()).includes('on Open day'), 'a comment waits, with the entry it is on');
    await ana.locator('[data-comment-approve]').click();
    await page.locator('[data-comment][data-approved="yes"]').waitFor();
    assert((await ana.locator('[data-comment-approve]').count()) === 0, 'and is shown once approved');
    await page.locator('[data-comment]', { hasText: 'Cheap watches' }).locator('[data-comment-delete]').click();
    await page.locator('[data-comment]', { hasText: 'Cheap watches' }).waitFor({ state: 'detached' });
    assert((await page.locator('[data-comment]').count()) === 1, 'one that should not be shown is deleted');
    await page.locator('[data-nav="pages"]').click();
    await page.route('**/api/comments', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'no comments today' }) }));
    await page.locator('[data-nav="comments"]').click();
    await page.getByText('no comments today').waitFor();
    assert(true, 'comments that cannot be read say why');
    await page.unroute('**/api/comments');

    // A visitor's messages: everything kept about them, then erased.
    await page.locator('[data-nav="messages"]').click();
    await page.locator('[data-list="messages"] [data-message]').first().waitFor();
    await page.locator('[data-rights-email]').fill('ana@example.org');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-rights-export]').click()]);
    const exported = JSON.parse(readFileSync(await download.path(), 'utf8'));
    assert(exported.messages.length === 2 && exported.messages.every((m) => m.email === 'ana@example.org') && exported.comments.length === 1, "everything kept about a visitor can be given to them, comments included");
    await page.locator('[data-rights-erase]').click();
    await page.getByText('No messages yet.').waitFor();
    await page.locator('[data-nav="comments"]').click();
    await page.getByText('No comments yet.').waitFor();
    assert(true, 'and erased, comments included');
    await page.locator('[data-nav="pages"]').click();
    await page.route('**/api/messages', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'no messages today' }) }));
    await page.locator('[data-nav="messages"]').click();
    await page.getByText('no messages today').waitFor();
    assert(true, 'messages that cannot be read say why');
    await page.unroute('**/api/messages');

    // Every kind of field an entry can have.
    await page.locator('[data-nav="events"]').click();
    await page.locator('[data-open="open-day"]').click();
    await page.locator('[data-entry-field="where"] input').fill('The workshop');
    await page.locator('[data-entry-field="where"] input').blur();
    await page.locator('[data-entry-field="about"] textarea').fill('Come and see.\nBring a friend.');
    await page.locator('[data-entry-field="about"] textarea').blur();
    await page.locator('[data-entry-field="on"] input').fill('2027-05-01');
    await page.locator('[data-entry-field="on"] input').blur();
    const tickets = page.locator('[data-entry-field="tickets"] input');
    await tickets.nth(0).fill('Book a place');
    await tickets.nth(1).fill('/contact/');
    await tickets.nth(1).blur();
    const poster = page.locator('[data-entry-field="poster"]');
    const library = poster.locator('[data-media-library]');
    await library.click();
    await poster.locator('[data-media]').first().click();
    await poster.locator('img.preview').waitFor();
    await saved();
    if ((await library.getAttribute('aria-expanded')) === 'true') await library.click();
    await page.route('**/api/media', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'no media today' }) }));
    await library.click();
    await poster.getByText('no media today').waitFor();
    await page.unroute('**/api/media');
    await poster.locator('[data-media-file]').setInputFiles({ name: 'poster.png', mimeType: 'image/png', buffer: png(32, 32) });
    await saved();
    assert(true, 'an image field takes one from the library or a new upload, and says when the library cannot be read');
    await page.getByRole('button', { name: 'Publish' }).click();
    await saved();
    await page.getByText('Published', { exact: true }).waitFor();
    cli('export', db, join(dir, 'out'));
    const shown = readFileSync(join(dir, 'out', 'events', 'open-day', 'index.html'), 'utf8');
    assert(shown.includes('The workshop') && shown.includes('Bring a friend.') && shown.includes('href="/contact/"') && shown.includes('datetime="2027-05-01"') && /<img[^>]+\/media\//.test(shown), 'every kind of field typed in the admin is on the published entry');
    // The admin in another language: a pack like any other, chosen in the settings.
    await page.locator('[data-back]').click();
    await page.locator('[data-nav="settings"]').click();
    await page.locator('[data-admin-language]').selectOption('ro');
    // The admin opens again in its new language, on the settings it was changed in.
    await page.locator('[data-screen="settings"] h1', { hasText: 'Setări' }).waitFor();
    assert((await page.locator('html').getAttribute('lang')) === 'ro', 'the admin can be in Romanian, from its language pack');
    if (shots) await page.screenshot({ path: join(shots, 'admin-romanian.png') });
    await page.locator('[data-admin-language]').selectOption('');
    await page.locator('[data-screen="settings"] h1', { hasText: 'Settings' }).waitFor();
    assert(true, 'and back in English');
    // Light, dark or like the device, kept on this device (ADR 0084 d4).
    await page.locator('[data-scheme-choice="dark"]').click();
    assert((await page.locator('html').getAttribute('data-scheme')) === 'dark', 'the admin can be dark');
    await page.reload();
    await page.locator('[data-scheme-choice="dark"][aria-pressed="true"]').waitFor();
    assert((await page.locator('html').getAttribute('data-scheme')) === 'dark', 'and stays dark on this device');
    await page.locator('[data-scheme-choice="light"]').click();
    assert((await page.locator('html').getAttribute('data-scheme')) === 'light', 'or light');
    await page.locator('[data-scheme-choice="device"]').click();
    assert((await page.locator('html').getAttribute('data-scheme')) === null, 'or like the device again');
    // The way out to the site, and an address for each screen: reload keeps it, Back goes to the one before.
    await page.locator('[data-nav="pages"]').click();
    assert((await page.locator('[data-view-site]').getAttribute('href')) === '/' && (await page.locator('[data-view-site]').getAttribute('target')) === '_blank', 'the admin leads to the site, in a tab of its own');
    assert((await page.locator('[data-view="about"]').getAttribute('href')) === '/about/', "a published page's address in the list opens it on the site");
    await page.locator('[data-nav="media"]').click();
    assert(page.url().includes('at=media'), 'a screen writes its address');
    await page.reload();
    await page.locator('[data-nav="media"][aria-current="page"]').waitFor();
    assert(true, 'reloading keeps the screen');
    await page.locator('[data-nav="forms"]').click();
    await page.goBack();
    await page.locator('[data-nav="media"][aria-current="page"]').waitFor();
    assert(true, 'Back goes to the screen before');
    await page.locator('[data-nav="pages"]').click();
    await page.locator('[data-open="about"]').click();
    await page.locator('[data-view-page]').waitFor();
    assert(page.url().includes('at=edit/page/about') && (await page.locator('[data-view-page]').getAttribute('href')) === '/about/', 'the page open in the builder has its address, and a way to see it on the site');
    await page.reload();
    await page.locator('.doc', { hasText: 'About' }).waitFor();
    assert(true, 'reloading the builder opens the same page');
    await page.goBack();
    await page.locator('[data-nav="pages"][aria-current="page"]').waitFor();
    assert(true, 'Back from the builder goes to the list');
    assert(errors.length === 0, `no errors in the browser ${errors.join(' | ')}`);
  } catch (error) {
    if (shots) await browser.contexts()[0]?.pages()[0]?.screenshot({ path: join(shots, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
    server.kill();
  }
  rmSync(dir, { recursive: true, force: true });
  console.log('\nThe corners of the admin work.');
})().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
