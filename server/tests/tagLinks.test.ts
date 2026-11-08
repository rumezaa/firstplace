import { test } from 'node:test';
import assert from 'node:assert/strict';

// env.ts reads these at import time, so set them before loading the module.
process.env.DATABASE_URL ??= 'postgres://unused';
process.env.APP_LINK_BASE = 'exp://192.168.1.42:8081/--/';
process.env.WEB_APP_URL = 'https://app.example.com/';
const { tagPage } = await import('../src/tagLinks.js');

const ID = 'E6FAE905-BF12-2DFC-E5FE-8A96A63A8955';

test('table tags forward to <APP_LINK_BASE>table/<id>, lowercased', () => {
  const { status, html } = tagPage('table', ID);
  assert.equal(status, 200);
  assert.match(html, /href="exp:\/\/192\.168\.1\.42:8081\/--\/table\/e6fae905-bf12-2dfc-e5fe-8a96a63a8955"/);
  assert.match(html, /window\.location\.replace\("exp:\/\/192\.168\.1\.42:8081\/--\/table\/e6fae905/);
  assert.match(html, /Open in app/);
  assert.match(html, /href="https:\/\/app\.example\.com\/table\/e6fae905-bf12-2dfc-e5fe-8a96a63a8955">Open on the web/);
});

test('venue tags forward to floor/<id>', () => {
  const { status, html } = tagPage('floor', ID.toLowerCase());
  assert.equal(status, 200);
  assert.match(html, /href="exp:\/\/192\.168\.1\.42:8081\/--\/floor\/e6fae905-bf12-2dfc-e5fe-8a96a63a8955"/);
});

test('anything that is not a UUID is a 404 with no app link', () => {
  for (const bad of ['', 'abc', `${ID}x`, '<script>', '../etc/passwd']) {
    const { status, html } = tagPage('table', bad);
    assert.equal(status, 404);
    assert.doesNotMatch(html, /Open in app/);
  }
});
