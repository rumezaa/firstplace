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

test('gender: known values, self-describe rules, onboarded flag', () => {
  assert.equal(profileProblem({ gender: 'woman' }), null);
  assert.equal(profileProblem({ gender: null }), null);
  assert.match(profileProblem({ gender: 'robot' }) ?? '', /options/);
  assert.equal(profileProblem({ gender: 'self_describe', gender_self_describe: 'genderfluid' }), null);
  assert.match(profileProblem({ gender: 'self_describe', gender_self_describe: 'x'.repeat(41) }) ?? '', /40/);
  assert.match(profileProblem({ gender: 'man', gender_self_describe: 'x' }) ?? '', /self-describe/);
  assert.equal(profileProblem({ onboarded: true }), null);
  assert.match(profileProblem({ onboarded: false }) ?? '', /onboarded/);
});
