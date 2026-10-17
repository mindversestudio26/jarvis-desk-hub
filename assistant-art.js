/* Original adult holographic portrait. Trusted, constant SVG; the adapter owns state and events. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.JangeAssistantArt=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  let serial=0;
  const art=String.raw`
<svg class="assistant-portrait" viewBox="0 0 320 340" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
 <defs>
  <linearGradient id="__ID__skin" x1="0" y1="0" x2="1" y2=".8"><stop stop-color="#f3dfc4"/><stop offset=".24" stop-color="#d1e5d9"/><stop offset=".57" stop-color="#83b9bb"/><stop offset="1" stop-color="#285c74"/></linearGradient>
  <linearGradient id="__ID__light" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f5d2a1"/><stop offset=".5" stop-color="#7aeee8"/><stop offset="1" stop-color="#347789"/></linearGradient>
  <linearGradient id="__ID__suit" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1b414d"/><stop offset=".48" stop-color="#102834"/><stop offset="1" stop-color="#345b62"/></linearGradient>
  <linearGradient id="__ID__hair" x1="0" y1="0" x2="1" y2=".8"><stop stop-color="#17353e"/><stop offset=".45" stop-color="#081820"/><stop offset="1" stop-color="#28555d"/></linearGradient>
  <linearGradient id="__ID__gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffedbc"/><stop offset=".5" stop-color="#bb9557"/><stop offset="1" stop-color="#efd0a0"/></linearGradient>
  <linearGradient id="__ID__glass" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b0fcf1" stop-opacity=".4"/><stop offset="1" stop-color="#5799ac" stop-opacity=".07"/></linearGradient>
  <radialGradient id="__ID__warm"><stop stop-color="#da9a50" stop-opacity=".25"/><stop offset="1" stop-color="#da9a50" stop-opacity="0"/></radialGradient>
  <radialGradient id="__ID__aura"><stop stop-color="#5abcb8" stop-opacity=".2"/><stop offset="1" stop-color="#5abcb8" stop-opacity="0"/></radialGradient>
  <clipPath id="__ID__rain"><path d="M0 0H320V340H257L235 247L203 219L196 186L207 132L192 91L140 77L111 110L108 177L120 213L89 240L62 340H0Z"/></clipPath>
  <clipPath id="__ID__shelter"><path d="M0 0H320V340H315V75Q301 20 211 17Q117 17 85 75V340H0Z"/></clipPath>
  <clipPath id="__ID__body"><path d="M128 214Q160 231 193 214Q224 220 240 262L255 318H65L81 262Q97 221 128 214Z"/></clipPath>
 </defs>
 <ellipse class="assistant-aura" cx="160" cy="180" rx="149" ry="157" fill="url(#__ID__aura)"/>
 <g class="assistant-orbit" fill="none">
  <path d="M54 180A112 112 0 0 1 265 130M274 185A112 112 0 0 1 74 250" stroke="#7ddad5" stroke-opacity=".2"/>
  <path d="M70 105A120 120 0 0 1 248 97M49 213L44 213M274 213L281 213" stroke="#e0bc80" stroke-opacity=".55"/>
  <path d="M32 138V125H45M288 138V125H275M32 246V259H45M288 246V259H275" stroke="#86bfbe" stroke-opacity=".3"/>
 </g>
 <g class="assistant-weather assistant-stars" fill="#efd4a5"><circle cx="79" cy="94" r="1.4"/><circle cx="246" cy="112" r="1"/><path d="M264 82V91M260 86.5H268" stroke="#efd4a5" stroke-width=".7"/></g>
 <g class="assistant-weather assistant-heat"><ellipse cx="160" cy="190" rx="135" ry="130" fill="url(#__ID__warm)"/><path class="assistant-thermal" d="M51 258Q40 240 53 220T54 180M270 251Q281 231 268 213T269 175" fill="none" stroke="#d7ad74" stroke-opacity=".4" stroke-width="1.3"/></g>
 <g class="assistant-weather assistant-cold-air" fill="none" stroke="#c7e7ef" stroke-opacity=".3"><path d="M40 253Q62 244 84 249M236 242Q259 236 281 243M43 267H81M241 256H277"/></g>
 <g class="assistant-weather assistant-cloud" fill="none" stroke="#9ed7d8" stroke-opacity=".35"><path d="M36 111H84Q94 101 86 94Q82 89 75 92Q70 78 58 85Q47 84 45 96Q34 96 36 111ZM243 113H286"/></g>
 <g class="assistant-weather assistant-sun" fill="none" stroke="#e4bc7d"><circle cx="258" cy="97" r="14" stroke-opacity=".55"/><path d="M258 74V69M258 120V125M235 97H230M281 97H286M242 81L238 77M274 113L278 117" stroke-opacity=".5"/></g>
 <g class="assistant-weather assistant-snow" fill="none" stroke="#c4ecee" stroke-width="1"><path d="M63 123V139M56 127L70 135M56 135L70 127M263 162V178M256 166L270 174M256 174L270 166M75 222V234M70 225L80 231M70 231L80 225"/></g>
 <g class="assistant-weather assistant-fog" fill="none" stroke="#a8cfce" stroke-opacity=".28"><path d="M27 211H103M225 222H293M37 230H91M234 243H280"/></g>
 <g class="assistant-photo-wind" fill="none" stroke="#acd7d5" stroke-width=".8"><path d="M18 173Q39 160 62 171M25 190Q48 178 69 187M252 216Q279 203 300 211M247 234Q269 225 291 231"/></g>
 <g class="assistant-person">
  <g class="assistant-hair-back" fill="url(#__ID__hair)" stroke="#5eaaaa" stroke-width=".7">
   <path d="M125 100Q107 125 112 169Q115 195 97 226Q115 235 143 221L186 222Q216 218 222 194Q204 178 207 143Q214 100 180 84Z"/>
   <path class="assistant-hair-tail" d="M198 119Q228 136 219 174Q212 197 237 222Q217 221 204 202Q192 174 198 119Z"/>
  </g>
  <g class="assistant-torso">
   <path d="M144 182L141 214L126 225Q159 247 194 225L180 213L177 184Z" fill="url(#__ID__skin)" stroke="#92d0ce" stroke-width=".7"/>
   <path d="M147 192Q162 204 177 191L178 205Q163 219 143 203Z" fill="#174653" opacity=".36"/>
   <path d="M126 214Q159 232 194 214Q225 223 240 262L254 317Q162 336 66 317L81 262Q95 224 126 214Z" fill="url(#__ID__suit)" stroke="url(#__ID__light)" stroke-width="1.1"/>
   <path d="M139 204L158 217L181 204L190 221L161 242L131 222Z" fill="#14343e" stroke="url(#__ID__gold)" stroke-width="1.3"/>
   <path d="M145 211L159 222L177 211M160 242V307M106 232L124 262L112 306M213 232L196 262L209 307" fill="none" stroke="#69c5c7" stroke-width=".8" opacity=".65"/>
   <path d="M83 258L104 248L115 260M237 258L217 248L206 260M127 282Q159 298 193 282" fill="none" stroke="url(#__ID__gold)" stroke-width="1"/>
   <path d="M154 235L160 230L166 235L160 244Z" fill="url(#__ID__gold)"/>
   <g clip-path="url(#__ID__body)"><g class="assistant-beam"><path d="M60 255H260V268H60Z" fill="url(#__ID__glass)"/><path d="M66 255H254" stroke="#b3fff1" stroke-opacity=".65"/></g></g>
  </g>
  <g class="assistant-head"><g transform="translate(-9.6 -11.7) scale(1.06)">
   <path d="M125 140Q115 132 116 148Q117 163 128 162M194 140Q204 132 202 148Q202 160 192 163" fill="url(#__ID__skin)" stroke="#659eaa" stroke-width=".8"/>
   <path d="M124 113Q134 91 161 94Q188 92 198 120L195 157Q190 188 164 201Q143 200 128 177Q121 159 124 113Z" fill="url(#__ID__skin)" stroke="#9ddad4" stroke-width=".8"/>
   <path d="M127 152Q134 163 146 153Q143 165 132 174Q127 166 127 152ZM179 152Q189 157 195 147Q194 171 177 184Q187 169 179 152Z" fill="#285969" opacity=".23"/>
   <path d="M131 154Q138 150 147 154Q138 158 133 160M177 153Q186 148 191 150Q185 156 178 158" fill="#eed4bd" opacity=".34"/>
   <path d="M139 111Q148 103 159 104Q148 121 153 136L146 140Q137 122 139 111Z" fill="#fff2d8" opacity=".13"/>
   <path d="M133 161L143 157M179 157L187 153M145 186Q157 195 168 192" fill="none" stroke="#d6e7d5" stroke-width="1.2" opacity=".55"/>
   <path d="M163 142Q160 155 157 164Q161 168 168 164" fill="none" stroke="#326776" stroke-width="1.1" stroke-linecap="round"/>
   <path d="M165 151L167 161M160 164L164 165" fill="none" stroke="#e0f4e6" stroke-width="1.2" stroke-linecap="round"/>
   <g class="assistant-brows" fill="none" stroke="#173e49" stroke-width="1.6" stroke-linecap="round"><path d="M130 134Q140 128 150 133M173 133Q183 126 192 131"/></g>
   <g class="assistant-eyes">
    <path d="M130 143Q140 137 151 142Q143 148 132 145ZM172 141Q183 135 193 140Q183 146 173 143Z" fill="#bdd5cf" stroke="#183b49" stroke-width=".9"/>
    <ellipse cx="142" cy="142" rx="2.65" ry="3" fill="#548f8b"/><ellipse cx="183" cy="140.5" rx="2.65" ry="3" fill="#548f8b"/>
    <path d="M142 140V144M183 138.5V142.5" stroke="#102f3b" stroke-width="1.8"/>
    <path d="M129 143L126 139M132 140L130 136M191 138L195 133M193 140L198 137" stroke="#14343e" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M140.5 140H141.5M181.5 138.5H182.5" stroke="#f6fff4" stroke-width="1.7" stroke-linecap="round"/>
   </g>
   <g class="assistant-expression-soft" fill="none" stroke="#234b57" stroke-width="1.4" stroke-linecap="round"><path d="M131 143Q141 149 151 141M173 141Q184 146 193 139"/></g>
   <g class="assistant-expression-concern" fill="none" stroke="#254c54" stroke-width="1.6" stroke-linecap="round"><path d="M131 130L149 132M173 131L192 126"/></g>
   <path d="M148 177Q153 173 159 175Q163 172 168 174L178 175Q165 182 148 177Z" fill="#815b69"/>
   <path d="M148 177Q163 187 178 175Q165 181 148 177Z" fill="#ba9196"/>
   <path d="M149 177Q164 180 177 175M157 182L166 181" fill="none" stroke="#edc6b4" stroke-width=".45"/>
   <path d="M122 140Q108 112 124 93Q140 71 172 81Q197 77 207 102Q214 122 197 144L195 118Q177 113 169 97Q153 121 125 126Z" fill="url(#__ID__hair)" stroke="#6ab0af" stroke-width=".9"/>
   <path d="M120 117Q140 113 165 90Q146 88 130 101M173 91Q185 108 199 109M122 121Q149 115 169 94" fill="none" stroke="#467d81" stroke-width="1.1"/>
   <path d="M123 111Q147 107 167 85" fill="none" stroke="url(#__ID__gold)" stroke-width="1.8"/>
   <path d="M130 107L133 113M138 103L142 109M146 98L150 103" stroke="#cbb37b" stroke-width="1"/>
   <path d="M119 156L120 170L124 174L127 166M199 153L198 166L194 171" fill="none" stroke="url(#__ID__gold)" stroke-width="1.6"/>
   <circle cx="120" cy="157" r="2" fill="#bdf5e8"/><circle cx="199" cy="154" r="2" fill="#bdf5e8"/>
  </g></g>
  <g class="assistant-pose assistant-pose-idle">
   <path d="M98 236Q84 254 87 281L110 300L121 285L107 270L112 247M222 235Q239 255 234 281L212 300L201 285L215 270L208 246" fill="url(#__ID__suit)" stroke="#699da4" stroke-width="1"/>
   <path d="M111 283Q119 280 128 287L144 294Q148 297 143 299L130 295Q146 302 141 305L126 300Q139 307 133 309L119 302L109 294ZM210 283Q201 281 194 287L178 294Q174 298 179 299L193 294Q178 302 183 305L198 300Q184 307 190 309L204 302L213 294Z" fill="url(#__ID__skin)" stroke="#79afb2" stroke-width=".8"/>
   <path d="M108 282L119 292M213 282L202 292" stroke="url(#__ID__gold)" stroke-width="2"/>
  </g>
  <g class="assistant-pose assistant-pose-umbrella">
   <path d="M218 237Q242 248 247 234L224 200L211 209L229 233L215 244Z" fill="url(#__ID__suit)" stroke="#8abcb9"/>
   <path d="M212 212L205 204Q201 200 204 197L208 198L208 188Q210 184 212 188L213 198Q224 194 226 201L223 211L217 215Z" fill="url(#__ID__skin)" stroke="#b5d7cf" stroke-width=".8"/>
   <path d="M98 238Q82 263 91 283L115 299L126 285L108 272L112 248" fill="url(#__ID__suit)" stroke="#699da4"/>
   <path d="M115 284Q124 282 133 291L140 299Q138 304 133 300L124 295L126 303Q123 306 119 300L112 294Z" fill="url(#__ID__skin)" stroke="#79afb2" stroke-width=".8"/>
  </g>
  <g class="assistant-pose assistant-pose-wipe">
   <g class="assistant-wiping-arm">
   <path d="M220 240Q248 239 246 219L220 150L205 159L224 220L208 235Z" fill="url(#__ID__suit)" stroke="#8bc0c1"/>
   <path d="M206 160Q199 148 187 142L178 133Q177 130 180 130L193 137L182 124Q183 120 186 123L199 135L190 121Q191 117 195 122L205 136L199 121Q202 118 206 127L214 145L217 153Z" fill="url(#__ID__skin)" stroke="#b7d9ce" stroke-width=".9"/>
   </g>
   <path d="M99 239Q88 267 102 292L120 286L112 267L116 249" fill="url(#__ID__suit)" stroke="#699da4"/>
   <path d="M101 289Q109 286 117 289L132 303Q130 309 123 302L115 297L119 307Q115 311 108 302Z" fill="url(#__ID__skin)" stroke="#79afb2" stroke-width=".8"/>
  </g>
  <g class="assistant-pose assistant-pose-wrap">
   <path d="M100 235Q79 251 89 276Q106 292 198 262L190 244L111 263L119 247M220 235Q239 250 230 277Q214 294 124 265L131 247L208 264L202 247" fill="url(#__ID__suit)" stroke="#8ab4b5" stroke-width="1.1"/>
   <path d="M189 245Q197 239 205 237L216 239Q220 243 211 244L201 246L213 248Q217 252 210 253L198 251L207 256Q208 261 201 257L192 255ZM130 248Q118 239 108 241L100 244Q98 248 105 247L117 247L104 251Q102 255 109 254L121 251L110 258Q111 262 117 258L128 257Z" fill="url(#__ID__skin)" stroke="#a2cfca" stroke-width=".8"/>
   <path d="M129 222Q158 234 189 222L202 237Q160 254 118 237Z" fill="url(#__ID__glass)" stroke="#c0e0d1" stroke-opacity=".65"/>
  </g>
  <g class="assistant-ribbon" fill="url(#__ID__glass)" stroke="url(#__ID__gold)" stroke-width=".8"><path d="M188 218Q227 221 239 198Q250 187 278 198Q249 205 254 218Q233 240 188 226Z"/></g>
 </g>
 <g class="assistant-umbrella" fill="none">
  <path d="M211 13V222Q211 233 201 228" stroke="url(#__ID__gold)" stroke-width="2"/>
  <path d="M85 75Q116 17 211 17Q301 20 315 75Q293 61 274 76Q249 60 231 77Q208 61 188 77Q163 61 145 76Q114 61 85 75Z" fill="url(#__ID__glass)" stroke="#9fe9df" stroke-width="1.2"/>
  <path d="M211 18Q167 26 145 76M211 18Q200 39 188 77M211 18Q227 37 231 77M211 18Q259 30 274 76M85 75Q185 58 315 75" stroke="#b8d9c8" stroke-opacity=".55" stroke-width=".8"/>
  <path d="M211 10V18" stroke="#f0ce94" stroke-width="2" stroke-linecap="round"/><path d="M208 199H216M208 203H216M210 207H216" stroke="#b4d6ca" stroke-width="2.2" stroke-linecap="round"/>
 </g>
 <g class="assistant-rain-uncovered" clip-path="url(#__ID__rain)"><path class="assistant-rain-strokes" d="M40 65L36 77M78 102L74 114M247 55L243 67M280 130L276 142M54 173L50 185M266 221L262 233M46 268L42 280M286 278L282 290" fill="none" stroke="#8bd3da" stroke-width="1" stroke-opacity=".55"/></g>
 <g class="assistant-rain-covered" clip-path="url(#__ID__shelter)"><path class="assistant-rain-strokes" d="M53 25L49 37M105 10L101 22M148 1L144 13M198 3L194 15M250 8L246 20M299 18L295 30M46 93L42 105M61 166L57 178M39 239L35 251" fill="none" stroke="#9ce7eb" stroke-width="1.1" stroke-opacity=".7"/></g>
 <path class="assistant-canopy-splashes" d="M115 42L111 37M115 42L120 36M161 24L158 19M161 24L166 19M275 39L272 33M275 39L281 35" fill="none" stroke="#c4fff1" stroke-width="1.1" stroke-linecap="round"/>
 <g class="assistant-protective" fill="none" stroke="#dbb576"><path d="M60 196Q53 136 92 98M266 194Q275 153 256 122" stroke-opacity=".5"/><path d="M66 190L60 196L55 188M262 186L266 194L272 189" stroke-width="1.2"/></g>
 <g class="assistant-plinth" fill="none"><ellipse cx="160" cy="320" rx="88" ry="10" stroke="#74cec8" stroke-opacity=".4"/><path d="M102 320Q160 330 218 320M145 334H175" stroke="url(#__ID__gold)" stroke-width="1.2"/><path d="M127 315H193" stroke="#b2ece3" stroke-opacity=".25"/></g>
</svg>`;
  function create(doc){
    doc=doc||(typeof document!=='undefined'?document:null);
    if(!doc||typeof doc.createElement!=='function') throw new TypeError('A DOM document is required');
    const scene=doc.createElement('div');
    scene.className='living-scene';
    Object.assign(scene.dataset,{condition:'neutral',phase:'unknown',activity:'idle',gesture:'idle',direction:'right',paused:'false'});
    const touch=doc.createElement('button');
    touch.type='button';touch.className='assistant-touch';
    touch.setAttribute('aria-label','Activate assistant attention');
    touch.innerHTML=art.replace(/__ID__/g,'jange-art-'+(++serial)+'-');
    const portrait=doc.createElement('span');portrait.className='assistant-photo-motion';
    for(const pose of ['idle','blink','umbrella','wipe','wrap']) {
      const img=doc.createElement('img');img.className='assistant-photo assistant-photo-'+pose;
      img.src='brand/assistant/'+pose+'.webp';img.alt='';img.width=600;img.height=800;img.decoding='async';img.draggable=false;
      img.addEventListener('load',()=>scene.classList.add('portrait-loaded-'+pose));
      if(pose==='idle') {img.addEventListener('load',()=>{scene.classList.add('has-realistic-portrait');scene.dispatchEvent(new Event('jange:portrait-ready'));});img.addEventListener('error',()=>scene.classList.remove('has-realistic-portrait'));}
      portrait.append(img);
    }
    touch.prepend(portrait);
    const caption=doc.createElement('div');caption.className='assistant-caption';
    const status=doc.createElement('span');status.className='assistant-status';status.textContent='Assistant';
    const context=doc.createElement('span');context.className='assistant-context';context.textContent='Ready';
    caption.append(status,context);scene.append(touch,caption);
    return scene;
  }
  return Object.freeze({create});
});
