/**
 * Signing in to an admin that others can reach (ADR 0022).
 *
 * On someone's own computer the editor is opened with the key it printed, as
 * before. Served at a public address it has accounts: the first owner comes
 * from a link printed when it starts, everyone else from a link the owner
 * makes, and each signs in with an address and a password. A session is a
 * secret in a cookie the page's script cannot read, sent only to this site.
 */
import { createHash } from 'node:crypto';
import { NAME } from '../core/index.ts';
import { languages } from './languages.ts';
import { localShared, type Shared } from './shared.ts';
import { cleanEmail, cleanRole, type LinkKind, passwordProblem, type Role, type Store, type User } from './store.ts';

const OPEN_ROUTES = ['POST /api/session', 'DELETE /api/session', 'POST /api/link', 'POST /api/link/use'];

export const SESSION_COOKIE = `${NAME}_session`;
const SESSION_SECONDS = 30 * 86_400;
const SETUP_HOURS = 1;
const INVITE_HOURS = 72;
/** Wrong passwords for one address in a window: enough for a person who mistypes, too few to guess. */
const TRIES = 10;
const TRIES_WINDOW_MS = 15 * 60 * 1000;
/** How long who a session signs in is kept where the processes share it, before the database is asked again. */
const SESSION_KEPT_MS = 60_000;
const hashed = (value: string): string => createHash('sha256').update(value).digest('hex');

/** The admin's public address: https, or http on this machine for trying it out. Nothing after the host. */
export function cleanPublicAddress(value: string): string {
  try {
    const url = new URL(value);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return '';
    if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return '';
    return url.origin;
  } catch {
    return '';
  }
}

export const cookieOf = (request: Request, name = SESSION_COOKIE): string => {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
};

/**
 * What only the owner may do. An editor writes and publishes pages, posts and
 * entries, and uploads images; an author and a contributor are kept to their
 * own entries by the server's other check (ADR 0055).
 */
export function ownerOnly(method: string, path: string): boolean {
  if (path.startsWith('/api/import') || path.startsWith('/api/export/') || path === '/api/messages' || path.startsWith('/api/users') || path.startsWith('/api/backups') || path.startsWith('/api/visitors') || path.startsWith('/api/mail')) return true;
  return (path === '/api/theme' || path === '/api/theme/publish' || path === '/api/site' || path === '/api/redirects' || path === '/api/not-found' || path === '/api/search-console' || path === '/api/forms' || path === '/api/performance' || path.startsWith('/api/fonts')) && method !== 'GET';
}

/** What the admin may know about the person signed in. */
export const shown = (user: User): { id: string; email: string; name: string; role: Role; bio: string; picture: string; bar: boolean } => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  bio: user.bio ?? '',
  picture: user.picture ?? '',
  bar: user.bar !== false,
});

export function accounts(store: Store, publicAddress: string, shared: Shared = localShared()) {
  const secure = publicAddress.startsWith('https:');
  const json = (data: unknown, status = 200, headers: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
  const cookie = (secret: string, seconds: number): string =>
    `${SESSION_COOKIE}=${secret}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
  const signedIn = async (user: User): Promise<Response> => json({ me: shown(user) }, 200, { 'set-cookie': cookie(await store.startSession(user.id), SESSION_SECONDS) });
  const linkUrl = (secret: string): string => `${publicAddress}/admin/#link=${secret}`;
  const hasOwner = async (): Promise<boolean> => (await store.users()).some((u) => u.role === 'owner' && u.active);

  // Wrong passwords are counted where the site's processes share them (ADR 0044 d4), by the address's hash.
  const tooMany = async (email: string): Promise<boolean> => (await shared.count(`tries:${hashed(email)}`)) >= TRIES;
  const failed = (email: string): Promise<number> => shared.hit(`tries:${hashed(email)}`, TRIES_WINDOW_MS);

  /**
   * Who a session signs in is kept for a minute under the people's generation:
   * signing out, a link used and any change to the people start a new one, so
   * nothing kept outlives what it was made from.
   */
  const generation = async (): Promise<string> => (await shared.get('people:generation')) ?? '0';
  const changed = async (): Promise<void> => shared.set('people:generation', crypto.randomUUID(), SESSION_SECONDS * 1000);
  const sessionUser = async (secret: string): Promise<User | null> => {
    if (!secret) return null;
    const key = `session:${await generation()}:${hashed(secret)}`;
    const kept = await shared.get(key);
    if (kept !== null) return JSON.parse(kept) as User;
    const user = await store.sessionUser(secret);
    if (user) await shared.set(key, JSON.stringify(user), SESSION_KEPT_MS);
    return user;
  };

  return {
    /** A link for the first owner, while the site has none; printed when the server starts. */
    async setupLink(): Promise<string> {
      if (await hasOwner()) return '';
      return linkUrl(await store.makeLink('setup', '', SETUP_HOURS));
    },

    /** Ends the request's session, from the admin bar's form (ADR 0075): what to set so the browser forgets it. */
    async signOut(request: Request): Promise<string> {
      const secret = cookieOf(request);
      if (secret) {
        await store.endSession(secret);
        await changed();
      }
      return cookie('', 0);
    },

    /** The person a request's session signs in, or null. */
    user: (request: Request): Promise<User | null> => sessionUser(cookieOf(request)),

    /** The calls anyone may make: signing in and out, and a link's form. Null when the path is not one of them. */
    async open(request: Request, url: URL): Promise<Response | null> {
      const route = `${request.method} ${url.pathname}`;
      // Only its own calls' bodies are read: a body is read once, and the rest are for the admin's calls.
      if (!OPEN_ROUTES.includes(route)) return null;
      const body = request.method === 'POST' ? ((await request.json().catch(() => ({}))) as Record<string, unknown>) : {};
      const text = (key: string): string => (typeof body[key] === 'string' ? (body[key] as string) : '');
      switch (route) {
        case 'POST /api/session': {
          const email = text('email').trim().toLowerCase();
          if (await tooMany(email)) return json({ error: 'too many wrong passwords; wait a quarter of an hour', signIn: true }, 429);
          const user = await store.checkPassword(email, text('password'));
          if (!user) {
            await failed(email);
            return json({ error: 'that address and password do not match', signIn: true }, 401);
          }
          await shared.del(`tries:${hashed(email)}`);
          return signedIn(user);
        }
        case 'DELETE /api/session':
          await store.endSession(cookieOf(request));
          await changed();
          return json({ signedOut: true }, 200, { 'set-cookie': cookie('', 0) });
        case 'POST /api/link': {
          const link = await store.link(text('secret'));
          if (!link || (link.kind === 'setup' && (await hasOwner()))) return json({ error: 'this link has been used or has run out' }, 410);
          if (link.kind !== 'setup') return json({ kind: link.kind, email: link.user?.email ?? '', name: link.user?.name ?? '' });
          // The first page of a new site (ADR 0048 d4): its name and language are chosen here, with the owner's account.
          const site = await store.site();
          return json({ kind: link.kind, email: '', name: '', site: { name: site.name, language: site.adminLanguage || site.language }, languages: languages().map((l) => ({ language: l.language, name: l.name })) });
        }
        default: {
          // POST /api/link/use, the last of OPEN_ROUTES.
          const link = await store.link(text('secret'));
          if (!link) return json({ error: 'this link has been used or has run out' }, 410);
          return this.useLink(link.kind, link.user, text('secret'), text('name'), text('email'), text('password'), { siteName: text('siteName'), language: text('language') });
        }
      }
    },

    async useLink(kind: LinkKind, user: User | null, secret: string, name: string, email: string, password: string, first: { siteName?: string; language?: string } = {}): Promise<Response> {
      // What was typed is checked before the link is spent, so a short password can be tried again.
      const siteName = (first.siteName ?? '').trim().slice(0, 120);
      const language = first.language && languages().some((l) => l.language === first.language) ? first.language : '';
      const problem =
        passwordProblem(password) ||
        (kind === 'setup' && !cleanEmail(email) ? 'that is not an email address' : '') ||
        (kind === 'setup' && first.language !== undefined && first.language !== '' && !language ? 'that language is not one this program has' : '');
      if (problem) return json({ error: problem }, 400);
      if (kind === 'setup' ? await hasOwner() : !user) return json({ error: 'this link has been used or has run out' }, 410);
      // Spending it is the database's one answer: two requests with the same link do not both get in.
      if (!(await store.link(secret, true))) return json({ error: 'this link has been used or has run out' }, 410);
      let who: User;
      if (kind === 'setup') {
        who = await store.addUser({ email, name, role: 'owner', password });
        // The site's name and language, as the first page asked (ADR 0048 d4); left as they were when not given.
        if (siteName || language) {
          const site = await store.site();
          await store.setSite({ ...site, ...(siteName ? { name: siteName } : {}), ...(language ? { language, adminLanguage: language } : {}) });
        }
      }
      else {
        await store.setPassword((user as User).id, password, kind === 'invite' ? name : undefined);
        who = (await store.user((user as User).id)) as User;
      }
      await changed();
      return signedIn(who);
    },

    /** Who a session signs in is asked of the database again: a name changed shows at once. */
    changed,

    /** The owner's calls about people: who has an account, inviting, links, roles, removing. Each change starts a new generation of sessions kept. */
    async people(request: Request, url: URL, me: User): Promise<Response> {
      const answer = await people(request, url, me);
      if (request.method !== 'GET') await changed();
      return answer;
    },
  };

  async function people(request: Request, url: URL, me: User): Promise<Response> {
    const body = request.method === 'POST' || request.method === 'PUT' ? ((await request.json()) as Record<string, unknown>) : {};
    const listed = async () => ({ users: await store.users(), me: shown(me) });
    if (url.pathname === '/api/users/link' && request.method === 'POST') {
      const user = await store.user(String(body.id ?? ''));
      if (!user) return json({ error: 'nobody has that account' }, 404);
      return json({ link: linkUrl(await store.makeLink(user.active ? 'reset' : 'invite', user.id, INVITE_HOURS)), ...(await listed()) });
    }
    if (url.pathname !== '/api/users') return json({ error: 'not found' }, 404);
    switch (request.method) {
      case 'GET':
        return json(await listed());
      case 'POST': {
        const user = await store.addUser({ email: String(body.email ?? ''), role: cleanRole(body.role) });
        return json({ link: linkUrl(await store.makeLink('invite', user.id, INVITE_HOURS)), ...(await listed()) });
      }
      case 'PUT':
        await store.setRole(String(body.id ?? ''), cleanRole(body.role));
        return json(await listed());
      case 'DELETE':
        // What they wrote passes to the owner removing them, or to whom the owner chose (ADR 0055 d5).
        await store.removeUser(url.searchParams.get('id') ?? '', url.searchParams.get('to') || me.id);
        return json(await listed());
      default:
        return json({ error: 'not found' }, 404);
    }
  }
}
