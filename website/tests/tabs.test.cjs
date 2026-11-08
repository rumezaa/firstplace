const test = require('node:test');
const assert = require('node:assert');
const { tabFromHash } = require('../js/tabs.js');

test('tabFromHash', () => {
  assert.strictEqual(tabFromHash('#venues'), 'venues');
  assert.strictEqual(tabFromHash('#people'), 'people');
  assert.strictEqual(tabFromHash('BUILT'), 'built');
  assert.strictEqual(tabFromHash('#contact'), null);
  assert.strictEqual(tabFromHash('#p3'), null);
  assert.strictEqual(tabFromHash(''), null);
  assert.strictEqual(tabFromHash(undefined), null);
});
