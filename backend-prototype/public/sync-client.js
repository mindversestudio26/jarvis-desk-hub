'use strict';
(function(root) {
  const request=indexedDB.open('jarvis-lab-cache-v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('cache');
  const ready=new Promise((yes,no)=>{request.onsuccess=()=>yes(request.result);request.onerror=()=>no(request.error);});
  const empty=()=>({identity:'owner',epoch:crypto.randomUUID(),binding:null,records:[],pending:[],conflicts:[]});
  const copy=v=>JSON.parse(JSON.stringify(v));
  const same=(a,b)=>!!a&&!!b&&['subject_id','workspace_id','generation'].every(k=>a[k]===b[k]);
  let state=empty(),csrf=null,authenticated=false,syncing=false,writing=0,blocked=false,serverBinding=null,syncFlight=null;
  const notify=()=>root.dispatchEvent(new Event('jarvis-lab-change'));
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('jarvis-lab-invalidate'):null;
  // Every mutation reads fresh state under a cross-tab IDB write lock. No network
  // awaits inside transactions: this also works without Web Locks on Safari.
  async function change(fn,write=true) {
    const db=await ready;
    const value=await new Promise((yes,no)=>{
      const tx=db.transaction('cache',write?'readwrite':'readonly'),store=tx.objectStore('cache');let next,result;
      const q=store.get('owner');q.onsuccess=()=>{try{next=q.result||empty();result=fn(next,store);if(write)store.put(next,'owner');}catch(e){no(e);tx.abort();}};
      tx.oncomplete=()=>yes({next,result});tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error||Error('Local transaction aborted'));
    });
    state=value.next;notify();if(write)channel?.postMessage('changed');return value.result;
  }
  async function load(){await change(()=>{},false);return copy(state);}
  if(channel)channel.onmessage=()=>load().catch(()=>{});
  root.addEventListener('pageshow',()=>load().catch(()=>{}));
  root.document.addEventListener('visibilitychange',()=>{if(!root.document.hidden)load().catch(()=>{});});
  function bound(s){if(blocked||!s.binding)throw Error('Workspace binding unavailable or changed. Preserve/export drafts before switching.');}
  function fence(s,epoch){if(s.epoch!==epoch)throw Error('Local session/cache changed; stale response rejected');}
  async function api(path,body,epoch) {
    if(path==='/sync'&&body){const expected=body.binding||copy(state.binding),expectedEpoch=epoch||state.epoch;await load();bound(state);fence(state,expectedEpoch);if(!same(expected,state.binding))throw Error('Workspace changed before request');body={...body,binding:expected};}
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try {
      const response=await fetch('/api/v1'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{})}:{},body:body?JSON.stringify(body):undefined,credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});
      const value=await response.json();
      if(!response.ok){const e=new Error(value.error||'Request failed');e.status=response.status;e.current=value.current;e.code=value.code;if(e.status===401){authenticated=false;csrf=null;}if(e.status===412)blocked=true;throw e;}return value;
    }finally{clearTimeout(timer);}
  }
  function records(kind){const map=new Map(state.records.filter(r=>r.kind===kind).map(r=>[r.id,r]));for(const op of state.pending.filter(r=>r.kind===kind))map.set(op.id,{...op,revision:op.base_revision,pending:true});return [...map.values()].filter(r=>!r.deleted);}
  async function enqueue(kind,id,data,deleted=false){
    if(kind==='memory')throw Error('Private memory cannot enter the offline queue');const expected=copy(state.binding),epoch=state.epoch;writing++;
    try{await change(s=>{bound(s);fence(s,epoch);if(!same(expected,s.binding))throw Error('Workspace changed before local save; retain input');if(s.pending.length>=200)throw Error('Offline queue full');if(s.pending.some(r=>r.kind===kind&&r.id===id)||s.conflicts.some(c=>c.operation.kind===kind&&c.operation.id===id))throw Error('This item already has a pending edit; sync or resolve it first');const old=s.records.find(r=>r.kind===kind&&r.id===id);s.pending.push({binding:copy(s.binding),operation_id:crypto.randomUUID(),kind,id,data,deleted,base_revision:old?.revision||0});});}finally{writing--;}
  }
  function merge(s,r){const i=s.records.findIndex(v=>v.kind===r.kind&&v.id===r.id);if(i<0)s.records.push(r);else if(s.records[i].revision<=r.revision)s.records[i]=r;}
  async function bind(binding,epoch){serverBinding=binding;await change(s=>{fence(s,epoch);if(!s.binding&&!s.records.length&&!s.pending.length&&!s.conflicts.length)s.binding=copy(binding);if(!same(s.binding,binding)){blocked=true;throw Error('Workspace or restore generation changed. Drafts retained; explicit archive/switch required.');}blocked=false;});}
  async function sync(){if(syncFlight)return syncFlight;syncFlight=performSync();try{return await syncFlight;}finally{syncFlight=null;}}
  async function performSync(){
    syncing=true;
    try{
      const epoch=await change(s=>s.epoch||(s.epoch=crypto.randomUUID()));
      const session=await api('/session');csrf=session.csrf;authenticated=true;await bind(session.binding,epoch);
      const remote=await api('/sync');await bind(remote.binding,epoch);
      await change(s=>{fence(s,epoch);if(!same(s.binding,remote.binding))throw Error('Workspace changed during sync');for(const r of remote.records)merge(s,r);});await load();
      for(const op of [...state.pending])try{
        const result=await api('/sync',op,epoch);await change(s=>{fence(s,epoch);if(!same(s.binding,op.binding)||!same(result.binding,op.binding))throw Error('Workspace changed during response');merge(s,result.record);s.pending=s.pending.filter(p=>p.operation_id!==op.operation_id);});
      }catch(e){if(e.status!==409)throw e;await change(s=>{fence(s,epoch);if(!same(s.binding,op.binding))throw Error('Workspace changed during conflict');if(s.pending.some(p=>p.operation_id===op.operation_id)&&!s.conflicts.some(c=>c.operation.operation_id===op.operation_id))s.conflicts.push({operation:op,current:e.current||null,error:e.message});s.pending=s.pending.filter(p=>p.operation_id!==op.operation_id);});}
      return copy(state);
    }finally{syncing=false;notify();}
  }
  async function login(username,password,device_name){if(syncFlight)await syncFlight.catch(()=>{});const value=await api('/auth/login',{username,password,device_name});csrf=value.csrf;authenticated=true;await sync();}
  async function logout(){await load();if(state.pending.length||state.conflicts.length)throw Error('Sync or resolve pending edits before signing out');await api('/auth/logout',{});authenticated=false;csrf=null;const retained=await change(s=>{s.epoch=crypto.randomUUID();if(s.pending.length||s.conflicts.length)return true;Object.assign(s,empty());return false;});if(retained)throw Error('Signed out; concurrent drafts retained in trusted-device cache');}
  async function resolve(index,keepMine){const id=state.conflicts[index]?.operation.operation_id;if(!id)return;await change(s=>{bound(s);const i=s.conflicts.findIndex(c=>c.operation.operation_id===id);if(i<0)return;const c=s.conflicts[i];if(!same(s.binding,c.operation.binding))throw Error('Cannot rebind a draft');if(keepMine)s.pending.push({...c.operation,operation_id:crypto.randomUUID(),base_revision:c.current?.revision||0});s.conflicts.splice(i,1);});}
  // Caller shows old/new bindings and obtains explicit confirmation. Archive,
  // never relabel, the entire previous workspace including unresolved drafts.
  async function switchWorkspace(expected){const session=await api('/session');if(!same(expected,session.binding))throw Error('Target changed; review again');await change((s,store)=>{store.add(copy(s),'quarantine:'+crypto.randomUUID());Object.assign(s,empty(),{binding:copy(session.binding)});});csrf=session.csrf;serverBinding=session.binding;blocked=false;await sync();}
  async function exportLocal(){const db=await ready;return new Promise((yes,no)=>{const q=db.transaction('cache').objectStore('cache').getAll();q.onsuccess=()=>yes(copy(q.result));q.onerror=()=>no(q.error);});}
  root.addEventListener('beforeunload',e=>{if(writing){e.preventDefault();e.returnValue='';}});
  root.JarvisSync={load,login,logout,sync,enqueue,records,resolve,api,switchWorkspace,exportLocal,get state(){return copy(state);},get bindingMismatch(){return blocked;},get serverBinding(){return copy(serverBinding);},get authenticated(){return authenticated;},get syncing(){return syncing;}};
})(window);
