const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const IMG = path.join(ROOT, 'img');
const SCENES = [
  'chatter_cafe_hope',
  'chatter_happy2_cafe',
  'chatter_happy_cafe',
  'chatter_hope_study',
  'chatter_lonely_cafe',
  'chatter_lonely_park',
  'chatter_study_alone',
  'chatter_study_happy',
  'lonely_chatter_park',
];
const KB = 1024;

function size(file) {
  return fs.statSync(path.join(IMG, file)).size;
}

test('every scene has 1920 and 960 webp', () => {
  for (const name of SCENES) {
    for (const w of ['1920', '960']) {
      const file = `${name}-${w}.webp`;
      assert.ok(fs.existsSync(path.join(IMG, file)), `missing img/${file}`);
    }
  }
});

test('image budget', () => {
  for (const name of SCENES) {
    assert.ok(size(`${name}-1920.webp`) < 350 * KB, `${name}-1920.webp over 350 KB`);
    assert.ok(size(`${name}-960.webp`) < 120 * KB, `${name}-960.webp over 120 KB`);
  }
  assert.ok(size('logo.png') < 40 * KB, 'logo.png over 40 KB');
});

// ---- Task 2: index.html structure ----
const HTML_PATH = path.join(ROOT, 'index.html');
const html = () => fs.readFileSync(HTML_PATH, 'utf8');
const HEADLINES = [
  'A city full of people.',
  'Wanting to talk is easy.',
  'What if the table told you?',
  'Just pull up a chair.',
  'The first minute, handled.',
  'Strangers become regulars.',
];
function panels() {
  const out = [];
  const re = /<article class="panel panel--(\w+)" id="(p\d)">([\s\S]*?)<\/article>/g;
  let m;
  while ((m = re.exec(html()))) out.push({ pos: m[1], id: m[2], body: m[3] });
  return out;
}

test('six panels in story order', () => {
  const ps = panels();
  assert.deepStrictEqual(ps.map((p) => p.id), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
  ps.forEach((p, i) => {
    const h2 = /<h2>([\s\S]*?)<\/h2>/.exec(p.body);
    assert.ok(h2, `${p.id} has no h2`);
    assert.strictEqual(h2[1].trim(), HEADLINES[i]);
  });
});

test('no tags on cards', () => {
  assert.ok(!/class="tag"/.test(html()));
});

test('every img has non-empty alt', () => {
  const imgs = html().match(/<img\b[^>]*>/g) || [];
  assert.ok(imgs.length >= 7);
  for (const tag of imgs) {
    const m = /\balt="([^"]*)"/.exec(tag);
    assert.ok(m && m[1].trim().length > 0, `empty alt: ${tag}`);
  }
});

test('positions alternate', () => {
  const ps = panels();
  for (let i = 1; i < ps.length; i++) {
    assert.notStrictEqual(ps[i].pos, ps[i - 1].pos, `${ps[i - 1].id}/${ps[i].id} share ${ps[i].pos}`);
  }
});

test('only google fonts external', () => {
  const urls = html().match(/(?:href|src)="https?:\/\/[^"]+"/g) || [];
  for (const u of urls) assert.match(u, /fonts\.(googleapis|gstatic)\.com/, u);
});

test('name', () => {
  // p6 copy legitimately says "your third place" (the concept); only the old product names are banned.
  assert.ok(!/first\s?place/i.test(html()));
  assert.ok(!/Third Place/.test(html()));
});

// ---- Task 3: motion and header state ----
const CSS_PATH = path.join(ROOT, 'css', 'site.css');
const JS_PATH = path.join(ROOT, 'js', 'main.js');
const css = () => fs.readFileSync(CSS_PATH, 'utf8');

// Innermost rules only (selector + body); @media wrappers are skipped.
function cssRules() {
  const src = css().replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) out.push({ selector: m[1].trim(), body: m[2] });
  return out;
}

// Body text of the first balanced {...} block at or after idx.
function blockAfter(text, idx) {
  const open = text.indexOf('{', idx);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
  }
  return null;
}

function mediaBlocks(query) {
  const text = css();
  const out = [];
  let idx = text.indexOf(query);
  while (idx >= 0) {
    const b = blockAfter(text, idx);
    if (b) out.push(b);
    idx = text.indexOf(query, idx + 1);
  }
  return out;
}

test('content visible without js', () => {
  const hiding = cssRules().filter(
    (r) => /\.reveal\b/.test(r.selector) && /opacity\s*:\s*0\b|visibility\s*:\s*hidden|display\s*:\s*none/.test(r.body)
  );
  assert.ok(hiding.length > 0, 'expected a hidden-state rule for .reveal');
  for (const r of hiding) {
    assert.match(r.selector, /(^|\s)\.js\b/, `unprefixed hiding rule: ${r.selector}`);
  }
});

test('reduced motion block', () => {
  const reveal = mediaBlocks('prefers-reduced-motion: reduce').find((b) => /\.reveal\b/.test(b));
  assert.ok(reveal, 'no reduced-motion block mentions .reveal');
  assert.match(reveal, /opacity\s*:\s*1/);
  assert.match(reveal, /transition\s*:\s*none/);
  assert.match(reveal, /img/, 'reduced-motion block should also remove the panel image scale');
});

test('scripts are classic defer', () => {
  const tags = html().match(/<script\b[^>]*>/g) || [];
  assert.ok(tags.some((t) => /src="js\/main\.js"/.test(t)), 'js/main.js is not loaded');
  for (const t of tags) {
    assert.match(t, /\bdefer\b/, t);
    assert.doesNotMatch(t, /type="module"/, t);
  }
});

test('main.js is classic, guarded, and leaves tabs to Task 4', () => {
  assert.ok(fs.existsSync(JS_PATH), 'js/main.js missing');
  const js = fs.readFileSync(JS_PATH, 'utf8');
  assert.doesNotMatch(js, /^\s*(import|export)\s/m);
  assert.match(js, /classList\.add\('js'\)/);
  assert.match(js, /'IntersectionObserver' in window/);
  assert.match(js, /threshold:\s*0\.35/);
  assert.match(js, /is-solid/);
  assert.match(js, /legend/);
  assert.doesNotMatch(js, /initTabs/);
});
