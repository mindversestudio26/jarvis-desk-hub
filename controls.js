/* Explicit foreground controls. Credentials live only in this closure, never storage/backups. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const actions = ['lock','sleep','restart','shutdown','launch'];
  const labels = {lock:'Lock',sleep:'Sleep',restart:'Restart',shutdown:'Shut down',launch:'Launch'};
  const buttons = [...document.querySelectorAll('.pc-controls .control-row button')];
  const make = (tag,text,id) => { const e=document.createElement(tag);if(text)e.textContent=text;if(id)e.id=id;return e; };
  const button = (text,id) => {const b=make('button',text,id);b.type='button';b.className='console-button';return b;};
  const access=make('div');access.className='control-access';
  const authorize=button('Authorize controls','control-authorize'),forget=button('Forget control key','control-forget');forget.hidden=true;
  access.append(authorize,forget);document.querySelector('.pc-controls').before(access);
  const status=make('p','Pair monitoring first, then authorize controls separately.','control-result');status.className='control-result';status.setAttribute('role','status');access.append(status);
  const auth=make('dialog',null,'control-auth');auth.className='panel control-dialog';auth.setAttribute('aria-labelledby','control-auth-title');
  const authTitle=make('h2','Authorize this PC','control-auth-title'),authNote=make('p','Use the separate control key. Your monitoring token cannot authorize commands.');
  const form=make('form'),label=make('label','Control credential');label.htmlFor='control-token';
  const input=make('input',null,'control-token');Object.assign(input,{type:'password',autocomplete:'new-password',required:true,minLength:32,maxLength:256});input.setAttribute('autocapitalize','off');input.spellcheck=false;
  const submit=make('button','Authorize');submit.type='submit';submit.className='console-button';const cancelAuth=button('Cancel','control-auth-cancel'),authResult=make('p',null,'control-auth-result');authResult.setAttribute('role','status');
  form.append(label,input,submit);auth.append(authTitle,authNote,form,authResult,cancelAuth);document.body.append(auth);
  const confirm=make('dialog',null,'control-confirm');confirm.className='panel control-dialog';confirm.setAttribute('aria-labelledby','control-confirm-title');
  const title=make('h2',null,'control-confirm-title'),detail=make('p',null,'control-confirm-detail'),appLabel=make('label','Approved application');appLabel.htmlFor='control-app';
  const apps=make('select',null,'control-app'),confirmButton=button('Confirm','control-confirm-send'),cancel=button('Cancel','control-confirm-cancel');
  confirm.append(title,detail,appLabel,apps,confirmButton,cancel);document.body.append(confirm);
  let session=null,busy=false,pending=null,epoch=0,confirmTimer=null;
  const requests=new Set();
  const connected=()=>agent && !agent.rejected && sys.pc==='online' && Date.now()-lastSample<30000;
  const valid=()=>session && connected() && session.url===agent.url && session.generation===pcGeneration && session.expires>Date.now() && !document.hidden;
  function render(){
    const ready=valid();buttons.forEach((b,i)=>{b.disabled=!ready||busy||!session.caps.actions.includes(actions[i])||(actions[i]==='launch'&&!session.caps.apps.length);});
    $('pc-controls-label').textContent=ready?'Control authorized · confirm each command':connected()?'Controls locked · separate authorization required':'Controls unavailable · connect monitoring';
    authorize.disabled=!connected()||busy;forget.hidden=!session;
  }
  function cancelPending(){pending=null;clearTimeout(confirmTimer);if(confirm.open)confirm.close();}
  function clear(message){epoch++;session=null;input.value='';cancelPending();requests.forEach(c=>c.abort());requests.clear();busy=false;submit.disabled=false;if(auth.open)auth.close();if(message)status.textContent=message;render();}
  async function request(path,body,credential=session){
    if(!credential)throw Error('control_auth_required');
    const c=new AbortController();requests.add(c);const timer=setTimeout(()=>c.abort(),6000);
    try{
      const response=await fetch(credential.url+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+credential.token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,credentials:'omit',redirect:'error',cache:'no-store',signal:c.signal});
      let value={};try{value=await response.json();}catch{}
      if(!response.ok){const e=Error(response.status===401?'control_auth_required':response.status===404?'control_unavailable':response.status===429?'rate_limited':value.error||'request_rejected');e.status=response.status;throw e;}
      return value;
    }finally{clearTimeout(timer);requests.delete(c);}
  }
  const messages={control_auth_required:'Control credential rejected. Authorize again.',control_unavailable:'Controls are not activated on this companion.',rate_limited:'Too many requests. Wait one minute before trying again.',control_busy:'Another command is still being handled.',expired_or_used_challenge:'Confirmation expired or was already used. Review the action again.',application_not_allowed:'This application is not on the PC allowlist.'};
  const errorText=e=>messages[e.message]||'Connection failed or command rejected. Check the PC before trying again.';
  authorize.onclick=()=>{if(!connected())return;authResult.textContent='';input.value='';auth.showModal();input.focus();};
  cancelAuth.onclick=()=>clear('Control authorization cancelled.');auth.addEventListener('cancel',e=>{e.preventDefault();clear('Control authorization cancelled.');});auth.addEventListener('close',()=>{input.value='';});
  form.onsubmit=async e=>{
    e.preventDefault();if(busy||!connected()||document.hidden)return;
    const token=input.value;input.value='';if(!/^[A-Za-z0-9_-]{32,256}$/.test(token)){authResult.textContent='Enter the separate control credential.';return;}
    const mine=++epoch, candidate={url:agent.url,token,generation:pcGeneration,expires:Date.now()+15*60000};busy=true;submit.disabled=true;render();
    try{
      const caps=await request('/v1/control',null,candidate);
      if(mine!==epoch||document.hidden||!connected()||candidate.generation!==pcGeneration)return;
      if(caps.protocol!==1||caps.enabled!==true||!Array.isArray(caps.actions)||!caps.actions.every(a=>actions.includes(a))||!Array.isArray(caps.apps)||caps.apps.length>20||!caps.apps.every(a=>a&&/^[a-z][a-z0-9_-]{0,39}$/.test(a.id)&&typeof a.label==='string'&&a.label.length<=60))throw Error('invalid_capabilities');
      session={...candidate,caps};status.textContent='Control authorized for 15 minutes on '+new URL(session.url).hostname+'.';auth.close();
    }catch(error){if(mine===epoch){session=null;authResult.textContent=errorText(error);status.textContent=errorText(error);}}
    finally{if(mine===epoch){busy=false;submit.disabled=false;render();}}
  };
  forget.onclick=()=>clear('Control credential cleared. Monitoring is unchanged.');
  buttons.forEach((b,i)=>{b.dataset.controlAction=actions[i];b.title='';b.onclick=()=>{
    if(!valid()||busy)return;
    pending={action:actions[i],epoch,expires:Date.now()+15000};title.textContent=labels[pending.action]+' · '+new URL(session.url).hostname;
    detail.textContent=pending.action==='launch'?'Only the selected app will start, without arguments.':pending.action==='lock'?'Lock Windows now. Unlock locally using your normal Windows sign-in.':pending.action==='sleep'?'The PC will sleep and disconnect. Use your existing power-on solution to return.':'Save your work first. This affects the whole PC. Windows may block the request if an app needs attention.';
    apps.replaceChildren();for(const app of session.caps.apps){const option=make('option',app.label);option.value=app.id;apps.append(option);}
    apps.hidden=appLabel.hidden=pending.action!=='launch';confirmButton.textContent='Confirm '+labels[pending.action];confirmButton.disabled=false;confirm.showModal();
    confirmTimer=setTimeout(()=>{cancelPending();status.textContent='Confirmation expired. Select the action again.';},15000);
  };});
  cancel.onclick=cancelPending;confirm.addEventListener('close',()=>{pending=null;clearTimeout(confirmTimer);});
  confirmButton.onclick=async()=>{
    if(!pending||!valid()||busy||pending.epoch!==epoch||Date.now()>=pending.expires)return;
    const action=pending.action, app_id=action==='launch'?apps.value:'', mine=epoch, connection=session;
    const request_id=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
    busy=true;confirmButton.disabled=true;cancelPending();render();status.textContent='Sending '+labels[action]+' request…';let sent=false;
    try{
      const intent=await request('/v1/control/challenge',{action,app_id,request_id},connection);
      if(mine!==epoch||!valid())return;
      if(intent.request_id!==request_id||typeof intent.challenge!=='string'||!/^[A-Za-z0-9_-]{32,256}$/.test(intent.challenge))throw Error('invalid_challenge');
      sent=true;await request('/v1/control/execute',{challenge:intent.challenge,request_id},connection);
      if(mine!==epoch)return;
      status.textContent=labels[action]+' request accepted. Waiting for Windows; the PC may disconnect.';
      // Reads may be repeated; execution is NEVER retried after a timeout.
      for(let n=0;n<5;n++){
        await new Promise(r=>setTimeout(r,700));if(mine!==epoch||document.hidden)return;
        const result=await request('/v1/control/result/'+request_id,null,connection);
        if(mine!==epoch)return;
        if(result.state==='accepted_by_windows'){status.textContent='Windows accepted the '+labels[action].toLowerCase()+' request.';break;}
        if(result.state==='failed'){status.textContent='Windows could not perform this action. Check app availability or Windows permissions.';break;}
      }
    }catch(error){if(mine===epoch){status.textContent=sent&&!error.status?'Command outcome unknown. Check the PC; it was not retried.':errorText(error);if(error.status===401){session=null;epoch++;}}}
    finally{if(mine===epoch||!session){busy=false;render();}}
  };
  window.addEventListener('jange:pc-state',()=>{if(session&&(!connected()||session.generation!==pcGeneration||session.url!==agent.url))clear('Control session cleared after the PC connection changed. Check any pending command on the PC.');else render();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear('Control key cleared while IMANE was in the background.');else render();});
  window.addEventListener('pagehide',()=>clear());
  setInterval(()=>{if(document.hidden)return;if(session&&!valid())clear('Control authorization expired or the PC is unreachable. Authorize again.');else render();},5000);
  render();
})();
