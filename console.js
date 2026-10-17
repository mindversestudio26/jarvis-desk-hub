/* JANGE console: moves the live application DOM; never duplicates its IDs. */
(() => {
  'use strict';
  if (window.JangeConsole) return;
  const q = s => document.querySelector(s);
  const host = q('main#hud');
  if (!host) return;
  const node = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls || ''; if (text != null) n.textContent = text; return n; };
  const button = (text, action, label) => { const b = node('button', 'console-button', text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', action); return b; };
  const move = (selector, target) => { const n = q(selector); if (n) target.append(n); return n; };
  const todayFormatter = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kathmandu',year:'numeric',month:'2-digit',day:'2-digit'});
  const today = () => { const p = todayFormatter.formatToParts(new Date()); return ['year','month','day'].map(t => p.find(x => x.type === t).value).join('-'); };
  const iso = (y,m,d) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const date = s => new Date(s + 'T12:00:00Z');
  const launch = id => document.getElementById(id)?.click();
  host.classList.add('console-ready');
  const header = node('header','console-header');
  move('.crown',header);
  const stamp = node('p','console-date'); stamp.setAttribute('aria-label','Current date in Kathmandu'); header.append(stamp);
  const nav = node('nav','console-nav'); nav.setAttribute('aria-label','Main pages'); header.append(nav);
  host.prepend(header);
  const deck = node('div','console-deck'); header.after(deck);
  const pages = ['home','pc','planner'].map((name,i) => { const s = node('section','console-page'); s.id = 'console-' + name; s.dataset.page = name; s.tabIndex = -1; s.setAttribute('aria-label',['Home','PC workstation','Planner'][i]); deck.append(s); return s; });
  const [home,pc,planner] = pages;
  const title = (page,kicker,name) => { const h = node('div','console-page-heading'); h.append(node('span','console-eyebrow',kicker),node('h2','',name)); page.append(h); };

  const clocks = node('div','console-clocks'); home.append(clocks); move('.dubai',clocks); move('.kathmandu',clocks);
  const nepaliDate = node('p','console-bs-date'); nepaliDate.lang = 'ne'; q('.kathmandu').append(nepaliDate);
  const homeGrid = node('div','console-home-grid'); home.append(homeGrid); move('.env',homeGrid); move('.agenda',homeGrid);
  const shiftCard = node('article','console-card console-shift'); shiftCard.append(node('span','console-eyebrow','ON THE HORIZON'),node('h3','','Your next shift')); const shiftSummary = node('div','console-shift-summary'); shiftCard.append(shiftSummary,button('Manage shifts ↗',() => { launch('alarms-open'); launch('tab-shifts'); })); homeGrid.append(shiftCard); move('.agenda',shiftCard);
  const plaque = node('div','console-plaque'); home.append(plaque); move('#daily-quote',plaque);
  title(pc,'02 / WORKSTATION','Your machine. At a glance.'); const pcGrid = node('div','console-pc-grid'); pc.append(pcGrid); move('.pc',pcGrid); move('.systems',pcGrid);
  q('#pc-controls-label').textContent = 'Controls unavailable · companion is read-only';
  q('.pc-controls').querySelectorAll('button').forEach(b => { b.disabled = true; b.title = 'Unavailable: the companion supports monitoring only'; });
  title(planner,'03 / MAKE ROOM FOR WHAT MATTERS','Plan with perspective.');
  const plannerGrid = node('div','console-planner-grid'); planner.append(plannerGrid);
  const calendar = node('article','console-card console-calendar'); plannerGrid.append(calendar);
  const tools = node('div','console-calendar-tools'); const modes = node('div','console-modes'); modes.setAttribute('role','group'); modes.setAttribute('aria-label','Calendar system'); tools.append(modes); calendar.append(tools);
  let mode = 'dual', anchor = today(), picked = anchor;
  const modeButtons = ['bs','gregorian','dual'].map(m => { const b = button({bs:'Bikram Sambat',gregorian:'Gregorian',dual:'Dual'}[m],() => { mode = m; paintCalendar(); }); b.dataset.calendarMode = m; modes.append(b); return b; });
  const monthNav = node('div','console-month-nav'); const monthTitle = node('h3',''); monthTitle.setAttribute('aria-live','polite');
  const prev = button('‹',() => step(-1),'Previous month'), next = button('›',() => step(1),'Next month');
  monthNav.append(prev,monthTitle,button('Today',() => { picked = anchor = today(); paintCalendar(); }),next); calendar.append(monthNav);
  const weekdays = node('div','console-weekdays'); ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(t => weekdays.append(node('span','',t))); calendar.append(weekdays);
  const cells = node('div','console-calendar-days'); calendar.append(cells);
  const calNote = node('p','console-calendar-note'); calNote.setAttribute('role','status'); calendar.append(calNote,node('p','console-holiday-note','Events use Dubai time · shifts retain their saved zone. Holidays are not included.'));
  const modules = node('aside','console-planner-modules'); plannerGrid.append(modules);
  const module = (name,cta,action) => { const card = node('article','console-card'); const head = node('div','console-module-heading'); head.append(node('h3','',name),button(cta,action)); const list = node('div','console-module-list'); card.append(head,list); modules.append(card); return list; };
  const taskList = module('Focus tasks','Edit ↗',() => launch('tasks-open'));
  const eventList = module('Day agenda','Add ↗',() => editDay(picked));
  const shiftsList = module('Upcoming shifts','Manage ↗',() => { launch('alarms-open'); launch('tab-shifts'); });
  // Keep all dynamic radar targets alive for app.js while removing the radar visually.
  const radar = q('.core-stage'); if (radar) { radar.hidden = true; radar.setAttribute('aria-hidden','true'); }
  ['.band','.wing-left','.wing-right'].forEach(s => { const n = q(s); if (n) n.hidden = true; });
  move('.dock',host);
  let returnDateFocus = null;
  function editDay(key) { returnDateFocus = key; picked = key; selected = key; viewYear = Number(key.slice(0,4)); viewMonth = Number(key.slice(5,7))-1; renderCalendar(); openPanel('agenda-dialog'); refresh(); }
  function bs(key) { try { return window.JangeNepali?.fromISO(key) || null; } catch { return null; } }
  function monthName(b) { const m = window.JangeNepali?.monthsNepali?.[b.month-1] || window.JangeNepali?.months?.[b.month-1]; return typeof m === 'string' ? m : m?.en || m?.name || `Month ${b.month}`; }
  function step(delta) {
    const b = bs(anchor), api = window.JangeNepali;
    if (mode !== 'gregorian') {
      if (!b) return;
      let y = b.year, m = b.month + delta; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
      try { const key = api.toISO(y,m,1); if (typeof key !== 'string' || !bs(key)) return; anchor = key; } catch { return; }
    } else { const d = date(anchor); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()+delta); anchor = d.toISOString().slice(0,10); }
    paintCalendar();
  }
  let calendarSignature = '';
  function paintCalendar() {
    const todayKey = today();
    const signature = JSON.stringify([mode,anchor,picked,todayKey,state.events,shiftStore.shifts]);
    if (signature === calendarSignature) return;
    calendarSignature = signature;
    const focusedDate = cells.contains(document.activeElement) ? document.activeElement.dataset.date : null;
    const api = window.JangeNepali, b = bs(anchor), useBS = mode !== 'gregorian';
    modeButtons.forEach(x => x.setAttribute('aria-pressed',String(x.dataset.calendarMode === mode)));
    cells.replaceChildren(); prev.disabled = next.disabled = useBS && !b;
    if (useBS && b) { prev.disabled = b.year === api.range.minYear && b.month === 1; next.disabled = b.year === api.range.maxYear && b.month === 12; }
    let start, count;
    try {
      if (useBS) { if (!b) throw Error('range'); start = api.toISO(b.year,b.month,1); count = api.daysInMonth(b.year,b.month); monthTitle.textContent = `${monthName(b)} ${api.devanagari(b.year)} BS`; }
      else { const d = date(anchor); start = iso(d.getUTCFullYear(),d.getUTCMonth()+1,1); count = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate(); monthTitle.textContent = d.toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}); }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isInteger(count) || count < 28 || count > 32) throw Error('range');
      const offset = (date(start).getUTCDay()+6)%7;
      for (let i = 0; i < offset; i++) cells.append(node('span','console-day-blank'));
      for (let day = 1; day <= count; day++) {
        const d = date(start); d.setUTCDate(d.getUTCDate()+day-1); const key = d.toISOString().slice(0,10), nep = bs(key);
        const label = useBS ? (api.devanagari ? api.devanagari(day) : day) : day;
        const c = button('',() => editDay(key)); c.className = 'console-day'; c.dataset.date = key; c.append(node('strong','',label));
        if (mode === 'dual') c.append(node('small','',d.toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'})));
        else if (mode === 'gregorian' && nep) c.append(node('small','',`${monthName(nep)} ${nep.day}`));
        c.setAttribute('aria-label',`${key}${nep ? ` · ${monthName(nep)} ${nep.day}, ${nep.year} BS` : ''} · edit agenda`);
        c.setAttribute('aria-pressed',String(key === picked)); if (key === todayKey) c.setAttribute('aria-current','date');
        if (typeof state !== 'undefined' && state.events.some(e => e.date === key)) c.classList.add('has-events');
        const dayShifts = typeof shiftStore !== 'undefined' ? shiftStore.shifts.filter(s => s.date === key) : [];
        if (dayShifts.length) { c.classList.add('has-shift'); const marker = node('span','console-shift-marker',dayShifts.some(s => s.type === 'off') ? 'OFF' : 'SHIFT'); marker.setAttribute('aria-hidden','true'); c.append(marker); c.setAttribute('aria-label',c.getAttribute('aria-label')+' · '+dayShifts.map(s => (window.JangeShifts?.shiftName(s)||s.type)+(s.start ? ' '+s.start : '')+' '+s.zone).join(', ')); }
        cells.append(c);
      }
      calNote.textContent = 'Kathmandu date reference · BS '+api.range.minYear+'–'+api.range.maxYear+' · select a date to edit';
      if (focusedDate && !q('dialog[open]')) cells.querySelector('[data-date="'+focusedDate+'"]')?.focus({preventScroll:true});
    } catch { monthTitle.textContent = 'Bikram Sambat'; calNote.textContent = 'BS conversion range unavailable. Choose Gregorian to continue planning.'; }
  }
  function fill(list,items,empty) { list.replaceChildren(); (items.length ? items : [empty]).forEach(text => list.append(node('p','console-list-row',text))); }
  function refresh() {
    if (document.hidden) return;
    stamp.textContent = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kathmandu',weekday:'short',day:'numeric',month:'long',year:'numeric'}).format(new Date()) + ' · Kathmandu';
    const nb = bs(today()); nepaliDate.textContent = nb ? `${monthName(nb)} ${window.JangeNepali.devanagari(nb.day)}, ${window.JangeNepali.devanagari(nb.year)} · विक्रम संवत्` : 'विक्रम संवत् · conversion range unavailable';
    const tasks = typeof state !== 'undefined' ? state.tasks : [], events = typeof state !== 'undefined' ? state.events : [];
    const shifts = typeof shiftStore !== 'undefined' ? shiftStore.shifts.filter(s => { const p = window.JarvisAlarms.localParts(Date.now(),s.zone); return s.date >= iso(p.y,p.m,p.d); }).sort((a,b) => (a.date+(a.start||'')).localeCompare(b.date+(b.start||''))) : [];
    const shiftText = s => `${s.date} · ${s.start || s.type}${s.end ? '–'+s.end : ''} · ${s.zone === 'Asia/Kathmandu' ? 'NPT' : 'GST'}${s.note ? ' · '+s.note : ''}`;
    const sourceShifts = typeof shiftStore !== 'undefined' ? shiftStore.shifts : [];
    const nowMs = Date.now(), al = window.JarvisAlarms, sh = window.JangeShifts;
    const instant = (s,time) => { try { const [y,m,d] = s.date.split('-').map(Number), [h,min] = time.split(':').map(Number); const at = al.zonedInstant(s.zone,y,m,d,h,min); return al.instant(at) ? at : null; } catch { return null; } };
    const nextWork = sourceShifts.filter(s => sh.WORKING.includes(s.type) && s.start).map(s => ({s,at:instant(s,s.start)})).filter(x => x.at !== null && x.at > nowMs).sort((a,b) => a.at-b.at)[0];
    const rest = sourceShifts.filter(s => s.type === 'off').map(s => ({s,at:instant(s,'00:00')})).filter(x => x.at !== null && x.at+86400000 > nowMs).sort((a,b) => a.at-b.at)[0];
    const shiftLines = [];
    if (nextWork) { const minutes = Math.ceil((nextWork.at-nowMs)/60000), days = Math.floor(minutes/1440), hours = Math.floor(minutes%1440/60); shiftLines.push(shiftText(nextWork.s), 'Starts in '+(days ? days+'d ' : '')+hours+'h '+minutes%60+'m'); }
    else shiftLines.push('No upcoming working shift with a saved start.');
    shiftLines.push(rest ? 'Next day off · '+rest.s.date+' · '+(rest.s.zone === 'Asia/Kathmandu' ? 'NPT' : 'GST') : 'No upcoming day off saved.');
    fill(shiftSummary,shiftLines,'');
    fill(taskList,tasks.filter(t => !t.done).slice(0,3).map(t => t.text),'A clear slate. Add your next focus.');
    fill(eventList,events.filter(e => e.date === picked).sort((a,b) => a.time.localeCompare(b.time)).slice(0,3).map(e => `${e.time} · ${e.text}`),'No events for the selected date.');
    fill(shiftsList,shifts.slice(0,3).map(shiftText),'No upcoming shifts saved.'); paintCalendar();
  }
  let active = 'home'; const navButtons = pages.map((p,i) => { const b = button(['Home','PC','Planner'][i],() => show(p.dataset.page,true)); b.dataset.pageTarget = p.dataset.page; b.setAttribute('aria-controls',p.id); nav.append(b); return b; });
  function show(name,focus = false) { if (!pages.some(p => p.dataset.page === name)) name = 'home'; const previous = active; active = name; pages.forEach(p => { const on = p.dataset.page === name; p.hidden = !on; p.inert = !on; p.setAttribute('aria-hidden',String(!on)); }); navButtons.forEach(b => b.setAttribute('aria-current',b.dataset.pageTarget === name ? 'page' : 'false')); host.dataset.activePage = name;
    if (previous !== name && !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.documentElement.classList.contains('calm')) {
      const arriving = pages.find(p => p.dataset.page === name), direction = pages.findIndex(p => p.dataset.page === name) > pages.findIndex(p => p.dataset.page === previous) ? 1 : -1;
      arriving.getAnimations().forEach(a => a.cancel());
      arriving.animate([{transform:'translateX('+(direction*48)+'px)',opacity:.25},{transform:'translateX(0)',opacity:1}],{duration:280,easing:'cubic-bezier(.2,.8,.2,1)'});
    }
     try { localStorage.setItem('jange.console.page.v1',name); } catch {} if (focus) pages.find(p => p.dataset.page === name).focus({preventScroll:true}); refresh(); }
  const excluded = target => target.closest('input,textarea,select,button,a,[contenteditable],dialog,.console-calendar');
  const navigate = n => { const i = pages.findIndex(p => p.dataset.page === active); show(pages[(i+n+3)%3].dataset.page,true); };
  document.addEventListener('keydown',e => { if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || q('dialog[open]') || e.target.closest('input,textarea,select,[contenteditable],.console-calendar')) return; if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); navigate(e.key === 'ArrowRight' ? 1 : -1); } });
  let touch = null;
  deck.addEventListener('touchstart',e => { touch = null; if (e.touches.length !== 1 || q('dialog[open]') || excluded(e.target)) return; for (let n = e.target; n && n !== deck; n = n.parentElement) if (n.scrollWidth > n.clientWidth+2 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return; touch = {x:e.touches[0].clientX,y:e.touches[0].clientY}; },{passive:true});
  deck.addEventListener('touchend',e => { if (!touch || !e.changedTouches.length) return; const dx = e.changedTouches[0].clientX-touch.x, dy = e.changedTouches[0].clientY-touch.y; touch = null; if (Math.abs(dx)>80 && Math.abs(dx)>Math.abs(dy)*1.6) navigate(dx<0 ? 1 : -1); },{passive:true});
  deck.addEventListener('touchcancel',() => { touch = null; },{passive:true});
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('close',() => {
    refresh();
    if (d.id === 'agenda-dialog' && returnDateFocus) {
      if (active === 'planner') cells.querySelector('[data-date="'+returnDateFocus+'"]')?.focus({preventScroll:true});
      returnDateFocus = null;
    }
  }));
  window.addEventListener('storage',refresh); window.addEventListener('jange:nepali-ready',refresh);
  let timer; function schedule() { clearInterval(timer); if (document.hidden) pages.forEach(p => p.getAnimations().forEach(a => a.cancel())); if (!document.hidden) { refresh(); timer = setInterval(refresh,60000); } } document.addEventListener('visibilitychange',schedule);
  window.JangeConsole = {refresh,navigate:show};
  let saved; try { saved = localStorage.getItem('jange.console.page.v1'); } catch {} show(saved || 'home'); schedule();
})();
