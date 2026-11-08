import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileProblem } from '../src/profileValidation.js';

test('rejects malformed bodies, blank names, and unsupported ages', () => {
  for (const body of [null, [], 'name', { name: '' }, { name: '   ' }, { age_range: 'under-18' }, { age_range: null }]) {
    assert.ok(profileProblem(body));
  }
});
test('rejects strings as booleans and malformed tag arrays', () => {
  for (const body of [{ incognito: 'false' }, { topics: 'hiking' }, { languages: [null] }, { interests: [' '] }, { comm_pref: 1 }]) {
    assert.ok(profileProblem(body));
  }
});
test('allows partial updates, empty optional lists, and adult profiles', () => {
  for (const body of [{ name: 'Alex' }, { incognito: false }, { interests: [] }, { age_range: '18-24', languages: ['English'], comm_pref: null }]) {
    assert.equal(profileProblem(body), null);
  }
});
