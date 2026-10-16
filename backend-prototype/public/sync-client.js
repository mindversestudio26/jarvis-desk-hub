'use strict';
(function(root) {
  const KEY='jarvis-lab-cache-v1'; // Deliberately separate from jarvis.desk.v2.
  const request = indexedDB.open(KEY,1);
  request.onupgradeneeded=()=>request.result.createObjectStore('cache');
  const dbReady=new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  let csrf=null, authenticated=false, syncing=false, writing=false;
  let state={identity:'owner',records:[],pending:[],conflicts:[]};
  let saveChain=Promise.resolve();
  const notify=()=>root.dispatchEvent(new Event('jarvis-lab-change'));
  async function load() {
    const db=await dbReady;
    const value=await new Promise((resolve,reject)=>{const q=db.transaction('cache').objectStore('cache').get('owner');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
    if(value && value.identity==='owner') state=value;
    notify();return state;
  }
  function persist() {
    const copy=JSON.parse(JSON.stringify(state));
    saveChain=saveChain.catch(()=>{}).then(async()=>{const db=await dbReady;await new Promise((resolve,reject)=>{const tx=db.transaction('cache','readwrite');tx.objectStore('cache').put(copy,'owner');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});});
    return saveChain;
  }
  async function api(path,body) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try {
      const response=await fetch('/api/v1'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{})}:{},body:body?JSON.stringify(body):undefined,credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});
      const value=await response.json();
      if(!response.ok){const error=new Error(value.error||'Request failed');error.status=response.status;error.current=value.current;if(response.status===401){authenticated=false;csrf=null;}throw error;}
      return value;
    } finally {clearTimeout(timer);}
  }
  function records(kind) {
    const map=new Map(state.records.filter(r=>r.kind===kind).map(r=>[r.id,r]));
    for(const op of state.pending.filter(r=>r.kind===kind))map.set(op.id,{...op,revision:op.base_revision,pending:true});
    return [...map.values()].filter(r=>!r.deleted);
  }
  async function enqueue(kind,id,data,deleted=false) {
    if(writing)throw Error('Wait for the current local save to finish');
    if(kind==='memory')throw Error('Private memory cannot enter the offline queue');
    if(state.pending.length>=200)throw Error('Offline queue full; sync before adding more');
    if(state.pending.some(r=>r.id===id&&r.kind===kind)||state.conflicts.some(r=>r.operation.id===id&&r.operation.kind===kind))throw Error('This item already has a pending edit; sync or resolve it first');
    const old=state.records.find(r=>r.id===id&&r.kind===kind);
    const operation={operation_id:crypto.randomUUID(),kind,id,data,deleted,base_revision:old?.revision||0};
    writing=true;state.pending.push(operation);
    try {await persist();}
    catch {state.pending=state.pending.filter(p=>p.operation_id!==operation.operation_id);throw Error('Local storage failed; the edit was not saved. Keep the input and retry.');}
    finally {writing=false;}
    notify();
  }
  async function sync() {
    if(syncing)return;syncing=true;
    try {
      const session=await api('/session');csrf=session.csrf;authenticated=true;
      const remote=await api('/sync');state.records=remote.records;
      for(const op of [...state.pending]) {
        try {const result=await api('/sync',op);state.records=state.records.filter(r=>!(r.kind===op.kind&&r.id===op.id));state.records.push(result.record);state.pending=state.pending.filter(p=>p.operation_id!==op.operation_id);await persist();}
        catch(error){if(error.status!==409)throw error;state.conflicts.push({operation:op,current:error.current||null,error:error.message});state.pending=state.pending.filter(p=>p.operation_id!==op.operation_id);await persist();}
      }
      await persist();notify();return state;
    } finally {syncing=false;notify();}
  }
  async function login(username,password,device_name) {const value=await api('/auth/login',{username,password,device_name});csrf=value.csrf;authenticated=true;await sync();}
  async function logout() {
    if(state.pending.length||state.conflicts.length)throw Error('Sync or resolve pending edits before signing out');
    await api('/auth/logout',{});authenticated=false;csrf=null;state={identity:'owner',records:[],pending:[],conflicts:[]};await persist();notify();
  }
  async function resolve(index,keepMine) {
    const conflict=state.conflicts[index];if(!conflict)return;
    if(keepMine)state.pending.push({...conflict.operation,operation_id:crypto.randomUUID(),base_revision:conflict.current?.revision||0});
    state.conflicts.splice(index,1);await persist();notify();
  }
  root.addEventListener('beforeunload',event=>{if(writing){event.preventDefault();event.returnValue='';}});
  root.JarvisSync={load,login,logout,sync,enqueue,records,resolve,api,get state(){return state;},get authenticated(){return authenticated;},get syncing(){return syncing;}};
})(window);
