'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const api = require('../assistant-state.js');
const {derive, normalizeObservation:normalize} = api;
const NOW = Date.UTC(2026,9,17,6,15);
const PLACE = {name:'Kathmandu',lat:27.72,lon:85.32,source:'manual'};
function body(current={}) {
  return {timezone:'Asia/Kathmandu',utc_offset_seconds:20700,
    current:{time:'2026-10-17T12:00',temperature_2m:25,apparent_temperature:25,
      wind_speed_10m:5,wind_direction_10m:120,weather_code:0,is_day:1,...current},
    daily:{sunrise:['2026-10-17T06:00']}};
}
function input(current={}, extra={}) {
  return {weather:normalize(body(current),PLACE,NOW),cached:false,online:true,
    selectedPlace:{...PLACE},pc:'off',processing:false,error:false,attentionUntil:0,now:NOW,...extra};
}
function settle(previous,current,now=NOW+1000,extra={}) {
  const pending=derive(input(current,{now,...extra}),previous);
  return [pending,derive(input(current,{now:now+8000,...extra}),pending)];
}
function freeze(x) { if (x && typeof x==='object') { Object.freeze(x); Object.values(x).forEach(freeze); } return x; }

test('CommonJS and browser UMD expose the same pure API', () => {
  const context={window:{},Intl,Date}; vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../assistant-state.js'),'utf8'),context);
  assert.equal(typeof context.window.JangeAssistantState.derive,'function');
  assert.deepEqual(Object.keys(context.window.JangeAssistantState),Object.keys(api));
  const data=freeze(input()), previous=freeze(derive(data)), config=freeze({heatTemperature:39});
  assert.deepEqual(derive(data,previous,config),derive(data,previous,config));
  assert.equal(derive(data).condition,'clear');
});

test('normalization preserves provenance without mutating source arrays', () => {
  const raw=freeze(body()), place=freeze({...PLACE});
  const result=normalize(raw,place,NOW);
  assert.equal(result.observedAt,NOW);
  assert.deepEqual(result.current,raw.current); assert.deepEqual(result.daily,raw.daily);
  assert.notEqual(result.daily.sunrise,raw.daily.sunrise);
  assert.deepEqual(result.place,place); assert.equal(result.timezone,'Asia/Kathmandu');
  assert.equal(result.utc_offset_seconds,20700); assert.equal(result.fetched,NOW);
});

test('strict provider calendar parsing, offset rollover, leap years and zone consistency', () => {
  for (const time of ['2026-02-29T12:00','2026-04-31T12:00','2026-13-01T12:00',
    '2026-10-17T24:00','2026-10-17T12:60','2026-10-17T12:00:60',
    '2026-10-17','2026-10-17T12:00Z','2026-10-17T12:00+05:45',' 2026-10-17T12:00',null,123]) {
    assert.equal(normalize(body({time}),PLACE,NOW).observedAt,null,String(time));
  }
  assert.equal(normalize(body({time:'2024-02-29T00:10:05.12'}),PLACE,NOW).observedAt,Date.UTC(2024,1,28,18,25,5,120));
  assert.equal(normalize(body({time:'2027-01-01T00:05'}),PLACE,NOW).observedAt,Date.UTC(2026,11,31,18,20));
  for (const patch of [{timezone:'Nonsense/Zone'},{timezone:null},{utc_offset_seconds:'20700'},
    {utc_offset_seconds:null},{utc_offset_seconds:20700.5},{utc_offset_seconds:50401},{utc_offset_seconds:14400}]) {
    assert.equal(normalize({...body(),...patch},PLACE,NOW).observedAt,null);
  }
  const ny={...body({time:'2026-03-08T02:30'}),timezone:'America/New_York',utc_offset_seconds:-18000};
  assert.equal(normalize(ny,PLACE,NOW).observedAt,null,'DST nonexistent wall time');
  assert.equal(normalize({...ny,current:{time:'2026-01-01T23:45'}},PLACE,NOW).observedAt,Date.UTC(2026,0,2,4,45));
});

test('timezone parsing and phase do not depend on device timezone', () => {
  const script=`const a=require(${JSON.stringify(path.join(__dirname,'../assistant-state.js'))});
    const b=${JSON.stringify(body())}; const p=${JSON.stringify(PLACE)};
    const w=a.normalizeObservation(b,p,${NOW});
    console.log(JSON.stringify(a.derive({weather:w,cached:false,online:true,selectedPlace:p,now:${NOW}})));`;
  const results=['UTC','America/Los_Angeles','Asia/Tokyo'].map(TZ => execFileSync(process.execPath,['-e',script],{env:{...process.env,TZ},encoding:'utf8'}));
  assert.equal(results[0],results[1]); assert.equal(results[1],results[2]);
});

test('nulls, wrong types, missing metadata and unknown codes fail closed', () => {
  for (const value of [null,undefined,[],false,'weather',{}]) assert.equal(derive(value).fresh,false);
  assert.equal(normalize(null,null,null).observedAt,null);
  for (const value of [null,'25',NaN,Infinity,{},[]]) {
    assert.equal(derive(input({temperature_2m:value})).condition,'neutral');
    assert.equal(derive(input({wind_speed_10m:value})).fresh,false);
    assert.equal(derive(input({weather_code:value})).fresh,false);
  }
  for (const weather_code of [-1,4,49,60,70,90,100,0.5]) assert.equal(derive(input({weather_code})).condition,'neutral');
  for (const extra of [{cached:undefined},{cached:'false'},{online:undefined},{online:'true'},
    {now:null},{now:'123'},{now:Infinity},{now:9e15},{weather:null},{selectedPlace:null}]) assert.equal(derive(input({},extra)).fresh,false);
  assert.equal(derive(input({apparent_temperature:null})).condition,'clear');
  assert.equal(derive(input({apparent_temperature:'100'})).condition,'clear');
});

test('freshness boundaries and forged normalized timestamps', () => {
  assert.equal(derive(input()).fresh,true);
  assert.equal(derive(input({}, {now:NOW+1200000})).fresh,true);
  assert.equal(derive(input({}, {now:NOW+1200001})).reason,'stale-weather');
  const w=normalize(body(),PLACE,NOW+600000);
  assert.equal(derive(input({}, {weather:w,now:NOW+1800000})).fresh,true);
  assert.equal(derive(input({}, {weather:w,now:NOW+1800001})).fresh,false);
  assert.equal(derive(input({}, {now:NOW-300000})).fresh,true);
  assert.equal(derive(input({}, {now:NOW-300001})).reason,'future-weather');
  for (const patch of [{fetched:NOW+300001},{observedAt:NOW+300001}]) {
    assert.equal(derive(input({}, {weather:{...input().weather,...patch}})).reason,'future-weather');
  }
  assert.equal(derive(input({}, {weather:{...input().weather,observedAt:NOW-1000}})).reason,'invalid-timestamp');
  assert.equal(derive(input({}, {weather:{...input().weather,timezone:'Bad/Zone'}})).reason,'invalid-timezone');
});

test('stale, cached, offline or changed location clears pose immediately', () => {
  const hot=derive(input({temperature_2m:39}));
  for (const extra of [{now:NOW+1200001},{cached:true},{online:false},
    {selectedPlace:{name:'Dubai',lat:25.2,lon:55.27}},
    {selectedPlace:{...PLACE,lat:'27.72'}}]) {
    const s=derive(input({temperature_2m:39},extra),hot);
    assert.equal(s.condition,'neutral'); assert.equal(s.gesture,'idle');
    assert.equal(s.phase,'unknown'); assert.equal(s.candidateCondition,null);
  }
  assert.equal(derive(input({}, {selectedPlace:{...PLACE,name:'Same coordinates'}})).fresh,true);
});

test('named-zone phase boundaries; unknown metadata never invents day/night', () => {
  for (const [hour,expected] of [[4,'day'],[5,'morning'],[9,'morning'],[10,'day'],[16,'day'],[17,'evening'],[19,'evening'],[20,'day']]) {
    const raw=body({time:`2026-10-17T${String(hour).padStart(2,'0')}:00`});
    const w=normalize(raw,PLACE,NOW); w.fetched=w.observedAt;
    assert.equal(derive(input({}, {weather:w,now:w.observedAt})).phase,expected);
    w.current.is_day=0; assert.equal(derive(input({}, {weather:w,now:w.observedAt})).phase,'night');
  }
  assert.equal(derive(input({is_day:null})).phase,'unknown');
  assert.equal(derive(input({is_day:'0'})).phase,'unknown');
});

test('explicit precipitation sets beat temperature and wind; fog stays fog', () => {
  for (const [codes,expected,gesture] of [ [[51,53,55,56,57,61,63,65,66,67,80,81,82],'rain','umbrella'],
    [[71,73,75,77,85,86],'snow','wrap'],[[95,96,99],'storm','alert'],[[45,48],'fog','idle']]) {
    for (const weather_code of codes) {
      const s=derive(input({weather_code,temperature_2m:45,wind_speed_10m:80}));
      assert.equal(s.condition,expected); assert.equal(s.gesture,gesture);
    }
  }
  assert.equal(derive(input({weather_code:2})).condition,'cloud');
  assert.equal(derive(input({weather_code:3})).condition,'cloud');
  assert.equal(derive(input({weather_code:1})).condition,'clear');
});

test('temperature and wind hysteresis, including configurable heat thresholds', () => {
  const hot=derive(input({temperature_2m:38})); assert.equal(hot.condition,'heat');
  assert.equal(derive(input({temperature_2m:35}),hot).condition,'heat');
  assert.equal(settle(hot,{temperature_2m:34.9})[1].condition,'clear');
  assert.equal(derive(input({apparent_temperature:40})).condition,'heat');
  assert.equal(derive(input({apparent_temperature:37}),hot).condition,'heat');
  assert.equal(derive(input({temperature_2m:35}),null,{heatTemperature:35}).condition,'heat');
  const cold=derive(input({temperature_2m:12})); assert.equal(cold.condition,'cold');
  assert.equal(derive(input({temperature_2m:14.9}),cold).condition,'cold');
  assert.equal(settle(cold,{temperature_2m:15})[1].condition,'clear');
  const wind=derive(input({wind_speed_10m:30})); assert.equal(wind.condition,'wind');
  assert.equal(derive(input({wind_speed_10m:24}),wind).condition,'wind');
  assert.equal(settle(wind,{wind_speed_10m:23.9})[1].condition,'clear');
});

test('settling takes eight continuous seconds and cancels/reset candidates', () => {
  const clear=derive(input());
  const [pending,rain]=settle(clear,{weather_code:61});
  assert.equal(pending.condition,'clear'); assert.equal(pending.reason,'settling');
  assert.equal(pending.candidateCondition,'rain'); assert.equal(pending.candidateSince,NOW+1000);
  assert.equal(derive(input({weather_code:61},{now:NOW+8999}),pending).condition,'clear');
  assert.equal(rain.condition,'rain'); assert.equal(rain.changedAt,NOW+9000);
  assert.equal(rain.candidateCondition,null); assert.equal(rain.gesture,'umbrella');
  const reset=derive(input({weather_code:95},{now:NOW+2000}),pending);
  assert.equal(reset.candidateCondition,'storm'); assert.equal(reset.candidateSince,NOW+2000);
  const cancel=derive(input({}, {now:NOW+2000}),pending);
  assert.equal(cancel.candidateCondition,null); assert.equal(cancel.changedAt,clear.changedAt);
  const back=derive(input({weather_code:61},{now:NOW}),pending);
  assert.equal(back.candidateSince,NOW);
});

test('timed gestures expire while persistent poses survive the entry cooldown', () => {
  const hot=derive(input({temperature_2m:39})); assert.equal(hot.gesture,'wipe'); assert.equal(hot.gestureAt,NOW);
  const repeat=derive(input({temperature_2m:39},{now:NOW+60000}),hot);
  assert.equal(repeat.gesture,'idle'); assert.equal(repeat.gestureAt,NOW);
  const rain=settle(hot,{weather_code:61})[1];
  assert.equal(rain.condition,'rain'); assert.equal(rain.gesture,'umbrella'); assert.equal(rain.gestureAt,NOW+9000);
  const storm=settle(rain,{weather_code:95},NOW+60000)[1];
  assert.equal(storm.gesture,'alert'); assert.equal(storm.gestureAt,NOW+68000);
  const early=derive(input({weather_code:95},{now:NOW+1000}),hot,{transitionMs:0,gestureCooldownMs:0});
  assert.equal(early.gesture,'alert');
  const future=derive(input({weather_code:95}),{...hot,gestureAt:NOW+1000,lastGestureAt:NOW+1000,lastGesture:'alert',gestureTimes:{alert:NOW+1000}},{transitionMs:0});
  assert.equal(future.gesture,'idle');
});

test('activity priority uses actual inputs, never speaking/listening', () => {
  for (const [extra,expected] of [[{},'idle'],[{pc:'online'},'connected'],[{pc:'unreachable'},'disconnected'],
    [{pc:'warming'},'idle'],[{pc:'auth'},'error'],[{online:false},'disconnected'],
    [{attentionUntil:NOW+1,pc:'online'},'attention'],[{attentionUntil:NOW},'idle'],
    [{processing:true,attentionUntil:NOW+1},'processing'],[{processing:true,error:true},'error'],
    [{processing:'true',error:'true',attentionUntil:'9999999999999'},'idle']]) {
    assert.equal(derive(input({},extra)).activity,expected);
  }
});

test('direction is finite bearing or null; malformed previous/config remain safe', () => {
  assert.equal(derive(input({wind_direction_10m:360})).direction,0);
  for (const value of [null,'120',-1,361,NaN]) assert.equal(derive(input({wind_direction_10m:value})).direction,null);
  for (const previous of [null,[],{},'state',{condition:'speaking'}]) assert.equal(derive(input(),previous).condition,'clear');
  assert.equal(derive(input(),null,{heatTemperature:NaN,transitionMs:-1}).condition,'clear');
});

test('adapter five-second refresh ends wipe and preserves cooldown through idle', () => {
  const hot=derive(input({temperature_2m:39}));
  const mid=derive(input({temperature_2m:39},{now:NOW+4999}),hot);
  assert.equal(mid.gesture,'wipe');
  const idle=derive(input({temperature_2m:39},{now:NOW+5000}),mid);
  assert.equal(idle.gesture,'idle'); assert.equal(idle.gestureAt,NOW); assert.equal(idle.lastGestureAt,NOW);
  const clear=derive(input({}, {now:NOW+10000}),idle,{transitionMs:0});
  const blocked=derive(input({temperature_2m:39},{now:NOW+20000}),clear,{transitionMs:0});
  assert.equal(blocked.gesture,'idle'); assert.equal(blocked.lastGestureAt,NOW);
  const clearAgain=derive(input({}, {now:NOW+50000}),blocked,{transitionMs:0});
  const allowed=derive(input({temperature_2m:39},{now:NOW+60000}),clearAgain,{transitionMs:0});
  assert.equal(allowed.gesture,'wipe'); assert.equal(allowed.lastGestureAt,NOW+60000);
});

test('persistent poses and timed alert cooperate with ten-second adapter polling', () => {
  for (const [current,gesture] of [[{weather_code:61},'umbrella'],[{temperature_2m:10},'wrap'],[{wind_speed_10m:40},'wind']]) {
    const start=derive(input(current));
    const polled=derive(input(current,{now:NOW+10000}),start);
    assert.equal(polled.gesture,gesture); assert.equal(polled.lastGestureAt,NOW);
  }
  const start=derive(input({weather_code:95}));
  assert.equal(start.gesture,'alert');
  assert.equal(derive(input({weather_code:95},{now:NOW+5000}),start).gesture,'idle');
  const neutral=derive(input());
  const pending=derive(input({temperature_2m:39},{now:NOW+10000}),neutral);
  const accepted=derive(input({temperature_2m:39},{now:NOW+20000}),pending);
  assert.equal(pending.condition,'clear'); assert.equal(accepted.condition,'heat');
  assert.equal(accepted.gesture,'wipe'); assert.equal(accepted.gestureAt,NOW+20000);
  assert.equal(derive(input({}, {attentionUntil:NOW+2500,now:NOW+2500})).activity,'idle');
});
test('rain to heat keeps umbrella during settling then admits a distinct wipe within sixty seconds', () => {
  const rain=freeze(derive(input({weather_code:61})));
  assert.equal(rain.gesture,'umbrella');
  const pending=derive(input({temperature_2m:39},{now:NOW+10000}),rain);
  assert.equal(pending.condition,'rain'); assert.equal(pending.gesture,'umbrella');
  assert.equal(pending.candidateCondition,'heat');
  const held=derive(input({temperature_2m:39},{now:NOW+17999}),pending);
  assert.equal(held.condition,'rain'); assert.equal(held.gesture,'umbrella');
  const hot=derive(input({temperature_2m:39},{now:NOW+18000}),held);
  assert.equal(hot.condition,'heat'); assert.equal(hot.gesture,'wipe');
  assert.equal(hot.lastGesture,'wipe'); assert.equal(hot.gestureAt,NOW+18000);
  assert.deepEqual(hot.gestureTimes,{umbrella:NOW,wipe:NOW+18000});
  assert.deepEqual(rain.gestureTimes,{umbrella:NOW},'previous cooldown map remains immutable');
  const idle=derive(input({temperature_2m:39},{now:NOW+23000}),hot);
  assert.equal(idle.gesture,'idle'); assert.deepEqual(idle.gestureTimes,hot.gestureTimes);
});

test('same wipe stays suppressed across clear and an intervening distinct gesture', () => {
  const hot=derive(input({temperature_2m:39}));
  const clear=settle(hot,{},NOW+10000)[1];
  const repeat=settle(clear,{temperature_2m:39},NOW+20000)[1];
  assert.equal(repeat.condition,'heat'); assert.equal(repeat.gesture,'idle');
  assert.equal(repeat.gestureTimes.wipe,NOW);
  const rain=derive(input({weather_code:61},{now:NOW+30000}),repeat,{transitionMs:0});
  assert.equal(rain.gesture,'umbrella'); assert.equal(rain.lastGesture,'umbrella');
  const blocked=derive(input({temperature_2m:39},{now:NOW+40000}),rain,{transitionMs:0});
  assert.equal(blocked.gesture,'idle'); assert.equal(blocked.gestureTimes.wipe,NOW);
  const clearAgain=derive(input({}, {now:NOW+50000}),blocked,{transitionMs:0});
  const allowed=derive(input({temperature_2m:39},{now:NOW+60000}),clearAgain,{transitionMs:0});
  assert.equal(allowed.gesture,'wipe'); assert.equal(allowed.gestureTimes.wipe,NOW+60000);
});