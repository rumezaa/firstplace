import type { Context } from 'hono';
import { env } from './env.js';

// What an NFC sticker or printed QR holds: a link to this server, not to the
// app. The server forwards to APP_LINK_BASE, so moving between Expo Go and a
// dev build (or a new laptop IP) is a config change, never a sticker rewrite.
//
//   /t/<tableId>  table box     → <APP_LINK_BASE>table/<tableId>
//   /v/<venueId>  venue entrance → <APP_LINK_BASE>floor/<venueId>?here=1 (checks you in)
//
// No login and no database call: the page is static apart from the id, so a
// tap is instant. The app's own screens do the lookups.

// Same check as routes/hw.ts.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TagKind = 'table' | 'floor';

const TITLES: Record<TagKind, string> = {
  table: 'Open this table in FirstPlace',
  floor: 'See who’s open to talk here',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

export function tagPage(kind: TagKind, rawId: string): { status: 200 | 404; html: string } {
  if (!UUID.test(rawId)) {
    return { status: 404, html: page('Link not recognised', '<p>This tag doesn’t point at a FirstPlace table or venue.</p>') };
  }
  const id = rawId.toLowerCase();
  // An entrance tag means you're standing in the venue: ?here=1 checks you in.
  const appLink = `${env.appLinkBase}${kind}/${id}${kind === 'floor' ? '?here=1' : ''}`;
  const webLink = env.webAppUrl ? `${env.webAppUrl}/${kind}/${id}` : null;

  // JSON.stringify gives a safe JS string literal; the < escape stops a
  // "</script>" in the configured base from closing the tag.
  const jsLink = JSON.stringify(appLink).replace(/</g, '\\u003c');
  const body = `
    <p>Opening the app…</p>
    <a class="btn" href="${escapeHtml(appLink)}">Open in app</a>
    ${webLink ? `<p><a href="${escapeHtml(webLink)}">Open on the web</a></p>` : ''}
    <p class="note">Nothing happened? Tap the button. Some phones block the automatic jump.</p>
    <script>window.location.replace(${jsLink});</script>`;
  return { status: 200, html: page(TITLES[kind], body) };
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;
         gap: 12px; padding: 24px; box-sizing: border-box; text-align: center;
         font-family: -apple-system, system-ui, sans-serif; background: #F6F6F3; color: #131516; }
  h1 { font-size: 24px; margin: 0; }
  p { margin: 0; font-size: 17px; }
  .btn { display: block; width: 100%; max-width: 360px; padding: 20px; border-radius: 16px; background: #131516;
         color: #fff; font-size: 20px; font-weight: 700; text-decoration: none; }
  a { color: #131516; }
  .note { font-size: 14px; opacity: 0.7; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
</body>
</html>`;
}

export function serveTag(kind: TagKind) {
  return (c: Context) => {
    const { status, html } = tagPage(kind, c.req.param('id') ?? '');
    c.header('Cache-Control', 'no-store');
    return c.html(html, status);
  };
}
