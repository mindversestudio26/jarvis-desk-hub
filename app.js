'use strict';
const $ = id => document.getElementById(id);
const STORE = 'jarvis.desk.v2';
const dubai = (d, options) => new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Dubai', ...options}).format(d);
const dayKey = d => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Dubai', year:'numeric', month:'2-digit', day:'2-digit'}).format(d);
const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2);
let state = {tasks:[],events:[]}, storageBroken = false;
function validData(v) {
  return v && Array.isArray(v.tasks) && v.tasks.length<=2000 && v.tasks.every(t=>t && typeof t.id==='string' && t.id.length<=100 && typeof t.text==='string' && t.text.length<=180 && typeof t.done==='boolean') && Array.isArray(v.events) && v.events.length<=2000 && v.events.every(e=>e && typeof e.id==='string' && e.id.length<=100 && typeof e.text==='string' && e.text.length<=120 && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(e.time));
}
function notice(text) { $('notice').textContent=text; $('notice').hidden=false; clearTimeout(notice.timer); notice.timer=setTimeout(()=>$('notice').hidden=true,6500); }
try {
  const raw=localStorage.getItem(STORE);
  if(raw) { const parsed=JSON.parse(raw); if(!validData(parsed)) throw Error('Invalid stored data'); state=parsed; }
  else {
    const old=JSON.parse(localStorage.getItem('jarvis_tasks')||'[]');
    if(Array.isArray(old)) state.tasks=old.filter(t=>typeof t==='string').slice(0,2000).map(text=>({id:uid(),text:text.slice(0,180),done:false}));
  }
} catch { storageBroken=true; notice('Saved data could not be read. Back up or restore your data in Settings.'); }
function save() {
  if(storageBroken) { notice('Storage unavailable. Changes last only this session; use Back up.'); return; }
  try {localStorage.setItem(STORE,JSON.stringify(state));} catch {storageBroken=true; notice('Could not save. Keep this page open and use Back up to preserve changes.');}
}
function tick() {
 const now=new Date(), hour=Number(dubai(now,{hour:'2-digit',hourCycle:'h23'}));
 $('clock').textContent=dubai(now,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 $('seconds').textContent=dubai(now,{second:'2-digit'}).padStart(2,'0');
 $('date').textContent=dubai(now,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
 $('greeting').textContent=hour<5?'A quieter kind of focus.':hour<12?'Good morning. Make it yours.':hour<18?'Good afternoon. Find your flow.':'Good evening. Settle into your space.';
 $('day-progress').textContent=dubai(now,{weekday:'long'})+' · Your desk, ready when you are';
 const key=dayKey(now); if(tick.lastDay && tick.lastDay!==key) renderCalendar(); tick.lastDay=key;
}
tick();setInterval(tick,1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){tick();if(Date.now()-weatherTime>900000)weather();pollPC();}});
function network() { $('network').textContent=navigator.onLine?'● Network available':'● Offline mode'; $('network').classList.toggle('offline',!navigator.onLine); }
network();addEventListener('online',()=>{network();weather();pollPC();});addEventListener('offline',network);
function renderTasks() {
 $('tasks').replaceChildren();$('task-empty').hidden=state.tasks.length>0;$('task-count').textContent=state.tasks.filter(t=>!t.done).length;
 state.tasks.forEach(t=>{ const row=document.createElement('div');row.className='task-row'+(t.done?' done':'');const label=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span'),del=document.createElement('button');check.type='checkbox';check.checked=t.done;text.textContent=t.text;check.onchange=()=>{t.done=check.checked;save();renderTasks();};del.className='delete';del.textContent='×';del.setAttribute('aria-label','Delete task '+t.text);del.onclick=()=>{state.tasks=state.tasks.filter(x=>x.id!==t.id);save();renderTasks();};label.append(check,text);row.append(label,del);$('tasks').append(row); });
}
$('task-form').onsubmit=e=>{e.preventDefault();const text=$('task-input').value.trim();if(text && state.tasks.length<2000){state.tasks.push({id:uid(),text,done:false});save();renderTasks();$('task-input').value='';}};
renderTasks();
let selected=dayKey(new Date());
let viewYear=Number(selected.slice(0,4)),viewMonth=Number(selected.slice(5,7))-1;
function renderCalendar() {
 $('month-label').textContent=new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(viewYear,viewMonth,1)));
 $('calendar').replaceChildren();const offset=(new Date(Date.UTC(viewYear,viewMonth,1)).getUTCDay()+6)%7,days=new Date(Date.UTC(viewYear,viewMonth+1,0)).getUTCDate();
 for(let i=0;i<offset;i++)$('calendar').append(document.createElement('span'));
 for(let d=1;d<=days;d++){const key=`${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,b=document.createElement('button');b.textContent=d;b.type='button';b.classList.toggle('today',key===dayKey(new Date()));b.classList.toggle('selected',key===selected);b.classList.toggle('has-event',state.events.some(e=>e.date===key));b.setAttribute('aria-label',dubai(new Date(key+'T12:00:00+04:00'),{day:'numeric',month:'long',year:'numeric'}));b.setAttribute('aria-pressed',String(key===selected));b.onclick=()=>{selected=key;renderCalendar();};$('calendar').append(b);}
 $('selected-date').textContent=dubai(new Date(selected+'T12:00:00+04:00'),{day:'numeric',month:'short'})+' · DUBAI TIME';renderEvents();
}
function shiftMonth(n){const d=new Date(Date.UTC(viewYear,viewMonth+n,1));viewYear=d.getUTCFullYear();viewMonth=d.getUTCMonth();renderCalendar();}
$('month-prev').onclick=()=>shiftMonth(-1);$('month-next').onclick=()=>shiftMonth(1);$('month-today').onclick=()=>{selected=dayKey(new Date());viewYear=Number(selected.slice(0,4));viewMonth=Number(selected.slice(5,7))-1;renderCalendar();};
function renderEvents(){ $('events').replaceChildren();const events=state.events.filter(e=>e.date===selected).sort((a,b)=>a.time.localeCompare(b.time)); if(!events.length){const p=document.createElement('p');p.className='muted';p.textContent='Nothing scheduled. A little breathing room.';$('events').append(p);}events.forEach(e=>{const row=document.createElement('div'),time=document.createElement('b'),title=document.createElement('span'),del=document.createElement('button');row.className='event-row';time.textContent=e.time;title.textContent=e.text;del.className='delete';del.textContent='×';del.setAttribute('aria-label','Delete event '+e.text);del.onclick=()=>{state.events=state.events.filter(x=>x.id!==e.id);save();renderCalendar();};row.append(time,title,del);$('events').append(row);});}
$('event-form').onsubmit=e=>{e.preventDefault();const text=$('event-input').value.trim(),time=$('event-time').value;if(text && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) && state.events.length<2000){state.events.push({id:uid(),text,date:selected,time});save();renderCalendar();$('event-input').value='';}};renderCalendar();
const weatherURL='https://api.open-meteo.com/v1/forecast?latitude=25.3463&longitude=55.4209&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=Asia%2FDubai';
let weatherTime=0,weatherBusy=false,lastWeather=null;
function describeWeather(code){if(code===0)return ['☀','Clear sky'];if(code<=3)return ['☁','Partly cloudy'];if(code<=48)return ['≋','Foggy'];if(code<=67)return ['☂','Rain'];if(code<=77)return ['❄','Snow'];if(code<=82)return ['☂','Rain showers'];if(code<=86)return ['❄','Snow showers'];if(code<=99)return ['ϟ','Thunderstorms'];return ['◌','Conditions unavailable'];}
function validWeather(c){return c && ['temperature_2m','relative_humidity_2m','wind_speed_10m','weather_code'].every(k=>typeof c[k]==='number'&&Number.isFinite(c[k]))&&typeof c.time==='string';}
function paintWeather(data,cached){const c=data.current,[icon,description]=describeWeather(c.weather_code);$('weather-icon').textContent=icon;$('temperature').textContent=Math.round(c.temperature_2m)+'°';$('humidity').textContent=Math.round(c.relative_humidity_2m)+'%';$('wind').textContent=Math.round(c.wind_speed_10m)+' km/h';$('weather-description').textContent=cached?'Weather unavailable · last saved: '+description:description;$('weather-updated').textContent=(cached?'Saved ':'Updated ')+dubai(new Date(data.fetched),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}
async function weather(){if(weatherBusy)return;weatherBusy=true;$('weather-retry').disabled=true;$('weather-description').textContent='Loading weather…';const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);try{const r=await fetch(weatherURL,{signal:controller.signal,cache:'no-store'});if(!r.ok)throw Error();const body=await r.json();if(!validWeather(body.current))throw Error();lastWeather={current:body.current,fetched:Date.now()};weatherTime=Date.now();paintWeather(lastWeather,false);try{localStorage.setItem('jarvis.weather.v1',JSON.stringify(lastWeather));}catch{}}catch{if(lastWeather)paintWeather(lastWeather,true);else{$('temperature').textContent='—';$('weather-description').textContent='Weather unavailable. Check internet, then refresh.';$('weather-updated').textContent='No saved weather';}}finally{clearTimeout(timeout);weatherBusy=false;$('weather-retry').disabled=false;}}
try{const c=JSON.parse(localStorage.getItem('jarvis.weather.v1'));if(c&&validWeather(c.current)&&Number.isFinite(c.fetched)&&c.fetched<=Date.now()){lastWeather=c;paintWeather(c,true);}}catch{}
$('weather-retry').onclick=weather;weather();setInterval(()=>{if(!document.hidden)weather();},900000);
function openSettings(){$('settings').showModal();}$('settings-open').onclick=openSettings;$('connect-open').onclick=openSettings;
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({...state,version:2,exported:new Date().toISOString()},null,2)],{type:'application/json'}),a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='jarvis-backup-'+dayKey(new Date())+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('import-file').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>2000000)throw Error();const v=JSON.parse(await f.text());if(!validData(v))throw Error();const merge=(a,b)=>[...new Map([...a,...b].map(x=>[x.id,x])).values()];const next={tasks:merge(state.tasks,v.tasks),events:merge(state.events,v.events)};if(!validData(next))throw Error();state=next;storageBroken=false;save();renderTasks();renderCalendar();notice('Backup restored. Existing items were kept.');}catch{notice('Invalid backup. Choose a Jarvis JSON backup under 2 MB.');}finally{e.target.value='';}};
let agent=null,pcBusy=false,pcGeneration=0;
function resetMetrics(){for(const id of ['cpu','gpu','ram','temp'])$(id).textContent='—';}
function pcStatus(text,message,online){$('pc-status').textContent='● '+text;$('pc-status').classList.toggle('offline',!online);$('pc-message').textContent=message;}
$('connect-form').onsubmit=e=>{e.preventDefault();try{const u=new URL($('agent-url').value);if(u.protocol!=='https:'||!u.hostname.endsWith('.ts.net')||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash)throw Error();const token=$('agent-token').value;if(token.length<32||token.length>256||!/^[A-Za-z0-9_-]+$/.test(token))throw Error();pcGeneration++;agent={url:u.origin,token};$('agent-token').value='';$('connect-result').textContent='Connecting securely…';resetMetrics();pollPC();}catch{$('connect-result').textContent='Use a Tailscale HTTPS host and a valid pairing token (32–256 characters).';}};
$('disconnect').onclick=()=>{pcGeneration++;agent=null;$('agent-token').value='';resetMetrics();pcStatus('Not connected','Monitoring disconnected. Your dashboard remains available.',false);$('connect-result').textContent='Disconnected; pairing token cleared.';};
async function pollPC(){if(!agent||pcBusy||document.hidden)return;pcBusy=true;const generation=pcGeneration,connection=agent,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6000);try{const r=await fetch(connection.url+'/v1/status',{headers:{Authorization:'Bearer '+connection.token},signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'});if(!r.ok)throw Error();const data=await r.json();if(generation!==pcGeneration)return;const age=Date.now()-Date.parse(data.sampled_at);if(!Number.isFinite(age)||age>30000||age< -5000||data.protocol!==1)throw Error();const metric=(v,max,suffix)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max?Math.round(v)+suffix:'—';$('cpu').textContent=metric(data.cpu_percent,100,'%');$('ram').textContent=metric(data.ram_percent,100,'%');$('gpu').textContent=metric(data.gpu_percent,100,'%');$('temp').textContent=metric(data.temperature_c,130,'°C');pcStatus('Online','Authenticated read-only monitoring · updated '+dubai(new Date(data.sampled_at),{hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}),true);$('connect-result').textContent='Connected. Monitoring only; controls remain disabled.';}catch{if(generation===pcGeneration){resetMetrics();pcStatus('Unreachable','PC may be off, asleep, or disconnected. Retrying automatically.',$('pc-status').dataset.online=== 'true');$('pc-status').classList.add('offline');$('connect-result').textContent='Connection failed. Check companion, pairing token and Tailscale.';}}finally{clearTimeout(timeout);pcBusy=false;}}
setInterval(pollPC,10000);
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').then(async registration=>{await navigator.serviceWorker.ready;$('offline-ready').textContent='Offline app ready';registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)notice('A Jarvis update is ready. Close and reopen the app to install.');});});}).catch(()=>$('offline-ready').textContent='Offline cache unavailable · retry online');}else $('offline-ready').textContent='Offline mode needs HTTPS';
