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
