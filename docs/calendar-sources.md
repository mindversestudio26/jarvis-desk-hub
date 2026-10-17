# Offline Nepali calendar sources

## Vendored source and license

The only third-party runtime content is the 12 integer month lengths per BS year
in `vendor/bs-data.js`. It is mechanically extracted, without changing values,
from [subeshb1/Nepali-Date v3.4.0](https://github.com/subeshb1/Nepali-Date/tree/2183c30ada24a7fe678a24d58a5aa61ce8cdfa85),
revision `2183c30ada24a7fe678a24d58a5aa61ce8cdfa85`:

- [Source table](https://github.com/subeshb1/Nepali-Date/blob/2183c30ada24a7fe678a24d58a5aa61ce8cdfa85/src/date-config.ts)
- [Epoch/conversion reference](https://github.com/subeshb1/Nepali-Date/blob/2183c30ada24a7fe678a24d58a5aa61ce8cdfa85/src/nepali-date-helper.ts)
- [Upstream tests](https://github.com/subeshb1/Nepali-Date/blob/2183c30ada24a7fe678a24d58a5aa61ce8cdfa85/test/nepali-date-helper.test.ts)
- [MIT license](https://github.com/subeshb1/Nepali-Date/blob/2183c30ada24a7fe678a24d58a5aa61ce8cdfa85/LICENSE), reproduced in full in `vendor/bs-data.LICENSE`, copyright 2020 Subesh Bhandari.

Only BS **2000–2083** is retained (84 rows / 1,008 integers); upstream's
2084–2090 rows and its permissive date parser/conversion code are not included.
The conversion implementation here is strict, uses the exact anchor
**BS 2000-01-01 = AD 1943-04-14**, and sums the actual month lengths.
There is no approximate year/month offset, downloaded runtime dependency,
calendar API, paid service, or network request.

## Research and accuracy limits

The requested primary project,
[opensource-nepal/node-nepali-datetime](https://github.com/opensource-nepal/node-nepali-datetime),
is GPL-3.0, rather than MIT. Its
[conversion constants](https://github.com/opensource-nepal/node-nepali-datetime/blob/main/src/dateConverter/constants.ts)
were consulted as a cross-check; none of its source is vendored.

An additional MIT source,
[nativeTiger/nepali-date-utils](https://github.com/nativeTiger/nepali-date-utils/tree/abc515487207bf194c07adb994af0b6336db2f9d),
provides [data/verification notes](https://github.com/nativeTiger/nepali-date-utils/blob/abc515487207bf194c07adb994af0b6336db2f9d/src/calendar-data.ts)
and [tests](https://github.com/nativeTiger/nepali-date-utils/blob/abc515487207bf194c07adb994af0b6336db2f9d/src/date-utils.test.ts).
Its modern-year rows 2080–2083 agree with the selected source, and its documented
new-year anchors for 2000, 2050, 2070, 2075, 2080–2083 are tested here.
That project's notes explicitly warn that distant future rows are projections.
This module deliberately stops at the end of 2083 and rejects dates beyond it.

The Nepal government-owned Gorkhapatra's
[2083-01-16 / 2026-04-29 dated issue](https://epaper.gorkhapatraonline.com/uploads/file/2026/4/gorkhapatra/2026-04-28-11-49-03-2083-01-16.pdf)
provides an independent published modern anchor included in the tests.
These checks establish published anchors and table consistency; round trips alone
cannot prove every historical month against a government panchang. This module
is not presented as a government-certified calendar or a festival/tithi source.

## API and browser integration

Load both local classic scripts in this order (defer both or neither):

```html
<script src="vendor/bs-data.js"></script>
<script src="nepali-calendar.js"></script>
```

The parent task must add these scripts to its page and offline/service-worker
asset list. Those files are outside this module's ownership and are not edited.
No runtime fetch occurs. A missing data script produces an explicit load error.
CommonJS consumers can `require('./nepali-calendar.js')` directly.

`globalThis.JangeNepali` exposes:

- `fromISO('2024-04-13')`: frozen `{year:2081, month:1, day:1,
  monthName:'Baisakh', monthNameNepali:'वैशाख', weekday:6, iso:'2024-04-13'}`.
  `weekday` uses Sunday=0 through Saturday=6.
- `toISO(year, month, day)`: Gregorian `YYYY-MM-DD` string.
- `daysInMonth(year, month)`: exact integer table value.
- `months`, `monthsNepali`: frozen arrays ordered Baisakh through Chaitra.
- `devanagari(value)`: string with ASCII digits replaced by Devanagari;
  punctuation and other text are preserved.
- `range`: frozen `{minYear:2000, maxYear:2083, minBS:'2000-01-01',
  maxBS:'2083-12-30', minISO:'1943-04-14', maxISO:'2027-04-13'}`.

**Months and days are 1-based.** ISO input must be a strict Gregorian date-only
string. Timestamps, offsets, Date objects, numeric coercion, invalid Gregorian
leap dates and normalized overflow dates are rejected. BS components must be
integers. Malformed ISO types/formats throw `TypeError`; invalid/out-of-range
dates and BS components throw `RangeError`. Bounds are inclusive.

All arithmetic uses UTC midnight solely to count civil days. No machine-local
clock or timezone is used. Callers choosing today's Nepal date must first select
the civil ISO date in `Asia/Kathmandu`; this module does not infer it from a timestamp.

## Verification and updates

Run `node --test tests/nepali-calendar.test.cjs`.
Tests cover fixed anchors, every supported day in both directions, continuity
across all month/year boundaries, Gregorian leap day, strict rejection, frozen
metadata, browser globals, and timezone independence.

To extend the range, first obtain a corroborated published month table, pin its
source revision/license, update the vendor bounds and documented endpoint, then
add independent anchors and rerun the complete targeted test. Do not extrapolate
or silently normalize an unsupported date.
