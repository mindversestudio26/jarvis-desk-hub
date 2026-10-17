/* The owner's work roster, shipped with IMANE so it appears by itself: no file to import.
   This file is public, so it holds shift times only; holidays are deliberately left out.
   To update: change the dates below and the version (any new string), then deploy. The iPad
   picks it up the next time IMANE opens online (the service worker fetches roster.js fresh).
   Each version is applied once and replaces the previous version's shifts; shifts added on
   the iPad and imported holidays stay. */
(function (root) {
  'use strict';
  const roster = Object.freeze({
    version: '2026-10-16',
    zone: 'Asia/Dubai',
    alarm: { prep: 120, commute: 30 }, // the alarm rings 2 h 30 min before each shift starts
    day: [                              // Day shift 07:00–19:00
      '2026-10-01', '2026-10-02', '2026-10-09', '2026-10-10', '2026-10-25', '2026-10-26',
      '2026-11-02', '2026-11-03', '2026-11-10', '2026-11-11', '2026-11-18', '2026-11-19',
      '2026-11-26', '2026-11-27', '2026-12-04', '2026-12-05',
    ],
    night: [                            // Night shift 19:00–07:00 the next morning
      '2026-10-05', '2026-10-06', '2026-10-13', '2026-10-14', '2026-10-29', '2026-10-30',
      '2026-11-06', '2026-11-07', '2026-11-14', '2026-11-15', '2026-11-22', '2026-11-23',
      '2026-11-30', '2026-12-01',
    ],
    off: ['2026-10-07', '2026-11-08'],  // "Off 8am–1pm" in the roster
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = roster;
  else root.JangeRoster = roster;
})(typeof window !== 'undefined' ? window : globalThis);
