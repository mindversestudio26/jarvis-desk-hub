/* Both cities are projections of one instant. Formatters are reused each tick. */
(function (root) {
  'use strict';
  const zones = [
    { id: 'dubai', zone: 'Asia/Dubai' },
    { id: 'kathmandu', zone: 'Asia/Kathmandu' },
  ];
  const formatters = zones.map(({ id, zone }) => ({
    id,
    time: new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }),
    date: new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }),
    key: new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    }),
  }));
  function snapshot(instant) {
    const date = new Date(instant);
    return Object.fromEntries(formatters.map(({ id, time, date: fullDate, key }) => {
      const fields = Object.fromEntries(time.formatToParts(date).map(p => [p.type, p.value]));
      const parts = Object.fromEntries(key.formatToParts(date).map(p => [p.type, p.value]));
      return [id, {
        time: fields.hour + ':' + fields.minute,
        seconds: fields.second,
        hour: Number(fields.hour),
        minute: Number(fields.minute),
        date: fullDate.format(date),
        day: parts.year + '-' + parts.month + '-' + parts.day,
        iso: date.toISOString(),
      }];
    }));
  }
  const api = { snapshot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JarvisTime = api;
})(typeof window === 'undefined' ? globalThis : window);
