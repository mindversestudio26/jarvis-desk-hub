/* Exact, offline BS conversion. Browser: load vendor/bs-data.js first. */
(function (root) {
  'use strict';
  const data = typeof module === 'object' && module.exports ? require('./vendor/bs-data.js') : root.JangeBSData;
  if (!data) throw new Error('Load vendor/bs-data.js before nepali-calendar.js');
  const DAY = 86400000;
  const epoch = Date.parse(data.epochISO + 'T00:00:00Z');
  const months = Object.freeze(['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Aswin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra']);
  const monthsNepali = Object.freeze(['वैशाख', 'जेठ', 'असार', 'श्रावण', 'भाद्र', 'आश्विन', 'कार्तिक', 'मंसिर', 'पौष', 'माघ', 'फाल्गुण', 'चैत्र']);
  const starts = [0];
  for (const row of data.rows) {
    if (row.length !== 12 || row.some(n => !Number.isInteger(n) || n < 29 || n > 32)) throw new Error('Invalid BS month data');
    starts.push(starts[starts.length - 1] + row.reduce((a, b) => a + b, 0));
  }
  const total = starts[starts.length - 1];
  const isoAt = offset => new Date(epoch + offset * DAY).toISOString().slice(0, 10);
  const range = Object.freeze({
    minYear: data.firstYear, maxYear: data.lastYear,
    minBS: '2000-01-01', maxBS: '2083-12-30',
    minISO: data.epochISO, maxISO: isoAt(total - 1)
  });
  function daysInMonth(year, month) {
    if (!Number.isInteger(year) || year < range.minYear || year > range.maxYear) throw new RangeError('BS year outside supported range');
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('BS month must be an integer from 1 to 12');
    return data.rows[year - data.firstYear][month - 1];
  }
  function toISO(year, month, day) {
    const length = daysInMonth(year, month);
    if (!Number.isInteger(day) || day < 1 || day > length) throw new RangeError('Invalid BS day');
    const index = year - data.firstYear;
    const offset = starts[index] + data.rows[index].slice(0, month - 1).reduce((a, b) => a + b, 0) + day - 1;
    return isoAt(offset);
  }
  function fromISO(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new TypeError('Expected date-only YYYY-MM-DD');
    const ms = Date.parse(iso + 'T00:00:00Z');
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== iso) throw new RangeError('Invalid Gregorian date');
    const offset = (ms - epoch) / DAY;
    if (offset < 0 || offset >= total) throw new RangeError('Gregorian date outside supported BS range');
    let index = 0;
    while (offset >= starts[index + 1]) index++;
    let remaining = offset - starts[index];
    let month = 1;
    while (remaining >= data.rows[index][month - 1]) remaining -= data.rows[index][month++ - 1];
    return Object.freeze({ year: data.firstYear + index, month, day: remaining + 1,
      monthName: months[month - 1], monthNameNepali: monthsNepali[month - 1],
      weekday: new Date(ms).getUTCDay(), iso });
  }
  function devanagari(value) { return String(value).replace(/[0-9]/g, digit => '०१२३४५६७८९'[Number(digit)]); }
  const api = Object.freeze({ fromISO, toISO, daysInMonth, months, monthsNepali, devanagari, range });
  root.JangeNepali = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
