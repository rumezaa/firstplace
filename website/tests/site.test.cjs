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
