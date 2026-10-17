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

test('hourly selection is stable across reloads and visits every quote before repeating', () => {
  const { forHour } = require('../quotes.js');
  const seen = new Set();
  for (let i = 0; i < QUOTES.length; i++) {
    const date = new Date(Date.UTC(2026, 9, 16, i));
    const day = date.toISOString().slice(0, 10), hour = date.getUTCHours();
    const q = forHour(day, hour);
    assert.deepEqual(q, forHour(day, hour));
    seen.add(q.index);
  }
  assert.equal(seen.size, QUOTES.length);
  assert.notEqual(forHour('2026-10-16', 23).q, forHour('2026-10-17', 0).q);
  assert.notEqual(forHour('2026-10-16', 12).q, forHour('2026-10-16', 13).q);
  assert.ok(forHour('2025-12-31', 23).q);
  for (const [day,hour] of [['2026-02-30', 1], ['invalid', 1], ['2026-10-16', 24], ['2026-10-16', -1]]) assert.throws(() => forHour(day,hour), RangeError);
});
