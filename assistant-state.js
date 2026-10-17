/* Pure assistant state. No clock reads, DOM, timers, network or control actions.
 * Pass each result back as previous, including candidateCondition/candidateSince.
 * wipe/alert last 5000ms; umbrella/wrap/wind persist while their condition holds.
 * gestureAt/lastGestureAt and lastGesture preserve the last admitted entry through idle.
 * gestureTimes retains per-gesture cooldowns; pass it back with the full previous result.
 * Persistent poses are not blocked by the entry-animation cooldown.
 * Weather is provider model data, not an on-site sensor; renderer owns that caption.
 * direction is meteorological wind bearing in degrees, or null. place is a label.
 * Config (Celsius, km/h, milliseconds): heatTemperature=38, heatApparent=40,
 * heatHysteresis=3, coldTemperature=12, coldExit=15, windSpeed=30, windExit=24,
 * transitionMs=8000, gestureCooldownMs=60000. Other config keys are ignored.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JangeAssistantState = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const DEFAULTS = Object.freeze({heatTemperature:38, heatApparent:40, heatHysteresis:3,
    coldTemperature:12, coldExit:15, windSpeed:30, windExit:24,
    transitionMs:8000, gestureCooldownMs:60000});
  const CONDITIONS = new Set(['neutral','clear','cloud','rain','storm','snow','heat','cold','wind','fog']);
  const PRECIP = {rain:new Set([51,53,55,56,57,61,63,65,66,67,80,81,82]),
    snow:new Set([71,73,75,77,85,86]), storm:new Set([95,96,99])};
  const CODES = new Set([0,1,2,3,45,48,...PRECIP.rain,...PRECIP.snow,...PRECIP.storm]);
  const GESTURES = {rain:'umbrella', storm:'alert', snow:'wrap', heat:'wipe', cold:'wrap', wind:'wind'};
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const label = p => object(p) && typeof p.name === 'string' ? p.name.trim().slice(0,160) : '';
  function zoneValid(zone) {
    if (typeof zone !== 'string' || !zone || /^[+-]/.test(zone)) return false;
    try { new Intl.DateTimeFormat('en', {timeZone:zone}).format(0); return true; }
    catch (_) { return false; }
  }
  function zoneParts(at, zone) {
    const parts = new Intl.DateTimeFormat('en-GB', {timeZone:zone, calendar:'gregory',
      numberingSystem:'latn', year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'}).formatToParts(at);
    return Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type,Number(p.value)]));
  }
  // Never Date.parse a provider wall time: validate its calendar fields, then subtract offset.
  function observation(time, offset, zone) {
    if (typeof time !== 'string' || !Number.isInteger(offset) || Math.abs(offset)>50400 || !zoneValid(zone)) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(time);
    if (!m) return null;
    const [year,month,day,hour,minute,second] = m.slice(1,7).map(v => Number(v || 0));
    if (year<1000 || month<1 || month>12 || day<1 || day>31 || hour>23 || minute>59 || second>59) return null;
    const ms = Number((m[7] || '').padEnd(3,'0'));
    const wall = Date.UTC(year,month-1,day,hour,minute,second,ms), d = new Date(wall);
    if (d.getUTCFullYear()!==year || d.getUTCMonth()!==month-1 || d.getUTCDate()!==day) return null;
    const at = wall-offset*1000, p = zoneParts(at,zone);
    return p.year===year && p.month===month && p.day===day && p.hour===hour && p.minute===minute && p.second===second ? at : null;
  }
  function normalizeObservation(body, place, fetched) {
    body = object(body) ? body : {};
    const current = object(body.current) ? {...body.current} : null;
    const daily = object(body.daily) ? Object.fromEntries(Object.entries(body.daily).map(([k,v]) => [k,Array.isArray(v) ? v.slice() : v])) : null;
    const timezone = zoneValid(body.timezone) ? body.timezone : null;
    const offset = Number.isInteger(body.utc_offset_seconds) && Math.abs(body.utc_offset_seconds)<=50400 ? body.utc_offset_seconds : null;
    return {current,daily,fetched:finite(fetched) ? fetched : null,
      place:object(place) ? {...place} : null,timezone,utc_offset_seconds:offset,
      observedAt:observation(current && current.time,offset,timezone)};
  }
  function coordinates(p) {
    return object(p) && finite(p.lat) && Math.abs(p.lat)<=90 && finite(p.lon) && Math.abs(p.lon)<=180;
  }
  function samePlace(a,b) {
    return coordinates(a) && coordinates(b) && Math.abs(a.lat-b.lat)<0.000001 && Math.abs(a.lon-b.lon)<0.000001;
  }
  function settings(config) {
    const c = {...DEFAULTS};
    if (object(config)) for (const k of Object.keys(c)) if (finite(config[k])) c[k]=config[k];
    if (c.heatHysteresis<0) c.heatHysteresis=DEFAULTS.heatHysteresis;
    if (c.coldExit<c.coldTemperature) c.coldExit=c.coldTemperature;
    if (c.windSpeed<0) c.windSpeed=DEFAULTS.windSpeed;
    if (c.windExit<0 || c.windExit>c.windSpeed) c.windExit=c.windSpeed;
    if (c.transitionMs<0) c.transitionMs=DEFAULTS.transitionMs;
    // A caller may lengthen the safety cooldown, never shorten it below a minute.
    c.gestureCooldownMs=Math.max(DEFAULTS.gestureCooldownMs,c.gestureCooldownMs);
    return c;
  }
  function weatherReason(input, now) {
    const w=input.weather;
    if (!finite(now) || Math.abs(now)>8.64e15) return 'invalid-time';
    if (input.online!==true) return 'offline';
    if (input.cached!==false) return 'cached-or-unknown';
    if (!object(w)) return 'missing-weather';
    if (!samePlace(w.place,input.selectedPlace)) return 'location-mismatch';
    if (!zoneValid(w.timezone) || !Number.isInteger(w.utc_offset_seconds) || Math.abs(w.utc_offset_seconds)>50400) return 'invalid-timezone';
    if (!finite(w.observedAt) || !finite(w.fetched)) return 'invalid-timestamp';
    if (w.observedAt-now>300000 || w.fetched-now>300000) return 'future-weather';
    if (now-w.observedAt>1800000 || now-w.fetched>1200000) return 'stale-weather';
    const v=w.current;
    if (!object(v) || !CODES.has(v.weather_code) || !finite(v.temperature_2m) || v.temperature_2m < -100 || v.temperature_2m>70 ||
      !finite(v.wind_speed_10m) || v.wind_speed_10m<0 || v.wind_speed_10m>500) return 'invalid-weather';
    // Reject forged or inconsistent normalized timestamps as well as invalid local dates.
    if (observation(v.time,w.utc_offset_seconds,w.timezone)!==w.observedAt) return 'invalid-timestamp';
    return 'current-weather';
  }
  function condition(v, previous, c) {
    for (const key of ['storm','rain','snow']) if (PRECIP[key].has(v.weather_code)) return key;
    if (v.weather_code===45 || v.weather_code===48) return 'fog';
    const apparent=finite(v.apparent_temperature) && v.apparent_temperature>=-100 && v.apparent_temperature<=100 ? v.apparent_temperature : null;
    const h=previous==='heat' ? c.heatHysteresis : 0;
    if (v.temperature_2m>=c.heatTemperature-h || (apparent!==null && apparent>=c.heatApparent-h)) return 'heat';
    if (previous==='cold' ? v.temperature_2m<c.coldExit : v.temperature_2m<=c.coldTemperature) return 'cold';
    if (previous==='wind' ? v.wind_speed_10m>=c.windExit : v.wind_speed_10m>=c.windSpeed) return 'wind';
    return v.weather_code===0 || v.weather_code===1 ? 'clear' : 'cloud';
  }
  function phase(w,now) {
    const hour=zoneParts(now,w.timezone).hour;
    if (w.current.is_day===0) return 'night';
    if (hour>=5 && hour<10) return 'morning';
    if (hour>=17 && hour<20) return 'evening';
    return w.current.is_day===1 ? 'day' : 'unknown';
  }
  function derive(input, previous=null, config={}) {
    input=object(input) ? input : {};
    const now=finite(input.now) && Math.abs(input.now)<=8.64e15 ? input.now : null;
    const prev=object(previous) && CONDITIONS.has(previous.condition) ? previous : null;
    const c=settings(config), reason=weatherReason(input,now), fresh=reason==='current-weather';
    const old=prev ? prev.condition : 'neutral';
    const target=fresh ? condition(input.weather.current,old,c) : 'neutral';
    const place=label(fresh ? input.weather.place : input.selectedPlace);
    let next=target, candidateCondition=null, candidateSince=null;
    // Stale/location-invalid data bypasses settling. A changed location label also resets settling.
    if (fresh && prev && target!==old && prev.fresh && prev.place===place && c.transitionMs>0) {
      candidateCondition=target;
      candidateSince=prev.candidateCondition===target && finite(prev.candidateSince) && prev.candidateSince<=now ? prev.candidateSince : now;
      if (now-candidateSince<c.transitionMs) next=old;
      else { candidateCondition=null; candidateSince=null; }
    }
    const changed=!prev || next!==old || prev.place!==place;
    const changedAt=changed ? now : finite(prev.changedAt) && prev.changedAt<=now ? prev.changedAt : now;
    let gesture='idle';
    let gestureAt=prev && finite(prev.lastGestureAt) ? prev.lastGestureAt : prev && finite(prev.gestureAt) ? prev.gestureAt : null;
    const gestureTimes={};
    for (const name of new Set(Object.values(GESTURES))) {
      if (prev && object(prev.gestureTimes) && finite(prev.gestureTimes[name])) gestureTimes[name]=prev.gestureTimes[name];
    }
    let lastGesture=prev && Object.values(GESTURES).includes(prev.lastGesture) ? prev.lastGesture : null;
    // Accept older caller state when its last gesture can still be identified.
    if (!lastGesture && prev && Object.values(GESTURES).includes(prev.gesture)) lastGesture=prev.gesture;
    if (lastGesture && gestureAt!==null && !finite(gestureTimes[lastGesture])) gestureTimes[lastGesture]=gestureAt;
    const wanted=fresh ? GESTURES[next] : null;
    const lastSame=wanted && finite(gestureTimes[wanted]) ? gestureTimes[wanted] : null;
    const admitted=changed && wanted && (lastSame===null || (now>=lastSame && now-lastSame>=c.gestureCooldownMs));
    if (admitted) { gestureAt=now; lastGesture=wanted; gestureTimes[wanted]=now; }
    if (wanted==='umbrella' || wanted==='wrap' || wanted==='wind') gesture=wanted;
    else if (wanted && (admitted || (!changed && prev && prev.gesture===wanted)) &&
      gestureAt!==null && now>=gestureAt && now-gestureAt<5000) gesture=wanted;
    const activity=input.error===true || input.pc==='auth' ? 'error' : input.processing===true ? 'processing' :
      finite(input.attentionUntil) && now!==null && input.attentionUntil>now ? 'attention' :
      input.pc==='online' ? 'connected' : input.pc==='unreachable' || input.online===false ? 'disconnected' : 'idle';
    const wind=fresh ? input.weather.current.wind_direction_10m : null;
    return {condition:next,phase:fresh ? phase(input.weather,now) : 'unknown',activity,gesture,place,
      reason:candidateCondition ? 'settling' : reason,fresh,direction:finite(wind) && wind>=0 && wind<=360 ? wind%360 : null,
      changedAt,gestureAt,lastGestureAt:gestureAt,lastGesture,gestureTimes,candidateCondition,candidateSince};
  }
  return Object.freeze({derive,normalizeObservation,DEFAULTS});
});
