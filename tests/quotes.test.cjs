const test = require('node:test');
const assert = require('node:assert/strict');
const { QUOTES, forDay } = require('../quotes.js');

test('every quote has text, author, a Nepali meaning and a source', () => {
  for (const q of QUOTES) {
    assert.ok(q.q.length > 10 && q.q.length <= 100, q.q);
    assert.ok(q.a.length > 2, q.q);
    assert.match(q.ne, /[ऀ-ॿ]/, q.q);
    assert.ok(q.src.length > 4, q.q);
  }
});
test('no duplicate quotes', () => {
  assert.equal(new Set(QUOTES.map(q => q.q)).size, QUOTES.length);
});
test('one quote per day, no repeat until the collection is exhausted', () => {
  const seen = new Set();
  for (let i = 0; i < QUOTES.length; i++) seen.add(forDay(new Date(Date.UTC(2026, 9, 16 + i)).toISOString().slice(0, 10)).index);
  assert.equal(seen.size, QUOTES.length);
  assert.notEqual(forDay('2026-10-16').q, forDay('2026-10-17').q);
});
test('neighbouring days never show the same author', () => {
  for (let i = 0; i < QUOTES.length; i++) assert.notEqual(QUOTES[i].a, QUOTES[(i + 1) % QUOTES.length].a, 'index ' + i);
});
