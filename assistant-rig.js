/* WebGL renderer for the expressive assistant. Deforms the single approved portrait
 * (idle.webp) with a dense mesh: feature handles for brows, cheeks, lids and mouth,
 * depth parallax for head turns, roll about the neck, breathing and shoulder lift.
 * Eyelids slide over the eye using the pixel-aligned closed-lid texture; irises move
 * inside the eye opening only. Renders on demand; the caller owns frame scheduling.
 * Returns null when WebGL is unavailable so the photo layers remain the fallback. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis);
  else root.JangeAssistantRig = factory(root);
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const HANDLES = 16;
  // Environment light shared by every textured layer: desaturation, warm/cool key, wet sheen, lightning rim.
  const GRADE = `
vec3 grade(vec3 rgb, vec2 p, vec4 g, vec4 fx) {
  float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
  rgb = mix(rgb, vec3(lum), g.z);
  float warm = g.x;
  rgb *= vec3(1.0 + 0.07 * warm, 1.0 + 0.012 * warm, 1.0 - 0.08 * warm);
  rgb += vec3(0.05, 0.028, 0.0) * max(warm, 0.0) * clamp(1.0 - p.y / 520.0, 0.0, 1.0) * lum;
  rgb = mix(rgb, rgb * rgb * 1.22 + vec3(0.0, 0.015, 0.035), g.w * 0.22);
  float side = clamp((p.x - 300.0) / 230.0, -1.0, 1.0);
  return rgb + vec3(0.5, 0.58, 0.72) * fx.x * (0.3 + 0.7 * max(side, 0.0)) * (0.35 + lum);
}`;
  const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif`;
  // Derived arm layers (atlas) drawn over the body in canonical image space.
  const LAYER_VERT = `
attribute vec2 a_pos; attribute vec2 a_uv; attribute vec2 a_src; uniform vec4 u_view;
varying vec2 v_uv; varying vec2 v_src; varying vec2 v_world;
void main() { v_uv = a_uv; v_src = a_src; v_world = a_pos; gl_Position = vec4(a_pos * u_view.xy + u_view.zw, 0.0, 1.0); }`;
  const LAYER_FRAG = `${PRECISION}
uniform sampler2D u_tex; uniform float u_alpha; uniform vec4 u_grade; uniform vec4 u_fx; uniform vec4 u_stub; uniform float u_stubAlpha;
varying vec2 v_uv; varying vec2 v_src; varying vec2 v_world;
${GRADE}
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  float stub = smoothstep(u_stub.x - 2.0, u_stub.x + 2.0, v_src.x) * (1.0 - smoothstep(u_stub.z - 2.0, u_stub.z + 2.0, v_src.x))
    * smoothstep(u_stub.y - 2.0, u_stub.y + 2.0, v_src.y) * (1.0 - smoothstep(u_stub.w - 2.0, u_stub.w + 2.0, v_src.y));
  c *= u_alpha * mix(1.0, u_stubAlpha, stub);
  if (c.a < 0.002) discard;
  vec3 rgb = grade(c.rgb / c.a, v_world, u_grade, u_fx) * u_grade.y;
  gl_FragColor = vec4(clamp(rgb, 0.0, 1.0) * c.a, c.a);
}`;
  // Procedural holographic geometry (umbrella, rain, splashes, breath) with premultiplied vertex colour.
  const COLOR_VERT = `
attribute vec2 a_pos; attribute vec4 a_col; uniform vec4 u_view; varying vec4 v_col;
void main() { v_col = a_col; gl_Position = vec4(a_pos * u_view.xy + u_view.zw, 0.0, 1.0); }`;
  const COLOR_FRAG = `${PRECISION}
uniform float u_flash; varying vec4 v_col;
void main() { vec4 c = v_col; c.rgb = min(c.rgb * (1.0 + u_flash * 0.6), vec3(1.0)); gl_FragColor = c; }`;
  const VERT = `
attribute vec2 a_pos; attribute vec4 a_w; attribute float a_depth; attribute vec2 a_arm;
uniform vec4 u_h[${HANDLES}]; uniform vec4 u_d[${HANDLES}];
uniform vec4 u_head; uniform vec3 u_roll; uniform vec4 u_body; uniform vec4 u_misc; uniform vec4 u_view; uniform vec4 u_arm;
varying vec2 v_rest; varying float v_hide;
void main() {
  vec2 p = a_pos, d = vec2(0.0);
  for (int i = 0; i < ${HANDLES}; i++) {
    vec2 q = (a_pos - u_h[i].xy) / u_h[i].zw;
    float w = max(0.0, 1.0 - dot(q, q));
    d += u_d[i].xy * w * w;
  }
  p += d;
  // Canonical right arm swings outward about the shoulder as the raised arm takes over.
  float aa = u_arm.x * a_arm.y; vec2 ao = p - u_arm.zw;
  p = u_arm.zw + vec2(cos(aa) * ao.x - sin(aa) * ao.y, sin(aa) * ao.x + cos(aa) * ao.y);
  float wh = a_w.x;
  p.x += wh * (u_head.x * a_depth + u_head.y);
  p.y += wh * (u_head.z * a_depth + u_head.w);
  float ang = u_roll.z * wh; vec2 o = p - u_roll.xy; float c = cos(ang), s = sin(ang);
  p = u_roll.xy + vec2(c * o.x - s * o.y, s * o.x + c * o.y);
  p.y -= a_w.y * u_body.x + a_w.z * u_body.z + wh * u_body.z * 0.55;
  p.x += (a_pos.x - 300.0) * u_body.y * a_w.y;
  p.x += u_body.w * (1.0 - a_pos.y / 800.0) + u_misc.y * (a_w.z + wh);
  p.x += a_w.w * u_misc.x;
  v_rest = a_pos; v_hide = a_arm.x;
  gl_Position = vec4(p * u_view.xy + u_view.zw, 0.0, 1.0);
}`;
  const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_idle; uniform sampler2D u_blink;
uniform vec4 u_lo, u_lc, u_ll, u_lt, u_lb, u_lx;
uniform vec4 u_ro, u_rc, u_rl, u_rt, u_rb, u_rx;
uniform vec4 u_eye; uniform vec4 u_grade; uniform vec4 u_fx; uniform vec4 u_cheeks; uniform float u_hide;
varying vec2 v_rest; varying float v_hide;
const vec2 SIZE = vec2(600.0, 800.0);
${GRADE}
float cv(vec4 c, float x) { float d = x - c.x; return c.y + c.z * d + c.w * d * d; }
vec4 tex(sampler2D t, vec2 p) { return texture2D(t, p / SIZE); }
vec4 eye(vec2 p, vec4 co, vec4 cc, vec4 cl, vec4 ct, vec4 cb, vec4 ex, float k, vec2 g, vec4 base) {
  float x = p.x;
  float wx = smoothstep(ex.x - 4.0, ex.x + 2.0, x) * (1.0 - smoothstep(ex.y - 2.0, ex.y + 4.0, x));
  float top = cv(ct, x), uo = cv(co, x), uc = max(cv(cc, x), uo + 0.5), lo = max(cv(cl, x), uo + 0.5);
  float bt = max(cv(cb, x), lo + 1.0);
  // The open lid (with its own lashes) slides down first; the closed-lid texture takes over near closure.
  float lash = mix(uo, uc, k), m = smoothstep(0.5, 0.92, k), mc = smoothstep(0.78, 1.0, k);
  top = min(top, lash - 6.0); // room above a raised lid
  if (wx <= 0.0 || p.y < top - 2.0 || p.y > bt + 1.0) return base;
  vec4 col;
  if (p.y < lash) {
    // Lash band moves rigidly with the lid margin; only the skin above it stretches.
    float bandTop = max(lash - 4.0, top + 0.5);
    vec4 lidOpen, lidClosed;
    float ms;
    if (p.y >= bandTop) {
      lidOpen = tex(u_idle, vec2(x, uo - (lash - p.y)));
      lidClosed = tex(u_blink, vec2(x, uc - (lash - p.y)));
      ms = m;
    } else {
      float f = clamp((p.y - top) / max(bandTop - top, 0.5), 0.0, 1.0);
      lidOpen = tex(u_idle, vec2(x, top + f * max(uo - 4.0 - top, 0.0)));
      lidClosed = tex(u_blink, vec2(x, top + f * max(uc - 4.0 - top, 0.0)));
      ms = smoothstep(0.08, 0.5, k);
    }
    col = mix(lidOpen, lidClosed, ms);
    col = mix(base, col, smoothstep(top - 2.0, top + 1.0, p.y));
  } else {
    float hw = (ex.y - ex.x) * 0.5;
    float fx = clamp(1.0 - abs(x - ex.z) / (hw * 1.05), 0.0, 1.0);
    fx = fx * fx * (3.0 - 2.0 * fx);
    float opening = smoothstep(lash - 0.5, lash + 1.0, p.y) * (1.0 - smoothstep(lo - 1.0, lo + 1.5, p.y));
    vec2 q = p;
    if (k < 0.0) q.y = uo + 2.5 + (p.y - lash) * (lo - uo - 2.5) / max(lo - lash, 0.5);
    q -= g * fx * opening;
    vec4 open = tex(u_idle, p.y <= lo + 1.0 ? q : p);
    float yb = p.y + (uc - lash) * clamp((bt - p.y) / max(bt - lash, 0.5), 0.0, 1.0);
    col = mix(open, tex(u_blink, vec2(x, yb)), mc);
    // The lowering lid shades the eyeball just beneath its margin.
    col.rgb *= 1.0 - 0.5 * exp(-max(p.y - lash, 0.0) / 2.2) * smoothstep(0.05, 0.6, k) * opening;
  }
  return mix(base, col, wx);
}
void main() {
  vec2 p = v_rest;
  vec4 c = tex(u_idle, p);
  c = eye(p, u_lo, u_lc, u_ll, u_lt, u_lb, u_lx, u_eye.x, u_eye.zw, c);
  c = eye(p, u_ro, u_rc, u_rl, u_rt, u_rb, u_rx, u_eye.y, u_eye.zw, c);
  c *= 1.0 - u_hide * v_hide;
  if (c.a < 0.002) { gl_FragColor = vec4(0.0); return; }
  vec3 rgb = grade(c.rgb / c.a, p, u_grade, u_fx);
  vec2 q1 = (p - u_cheeks.xy) / vec2(26.0, 18.0), q2 = (p - u_cheeks.zw) / vec2(26.0, 18.0);
  float cheek = exp(-dot(q1, q1)) + exp(-dot(q2, q2));
  rgb = mix(rgb, rgb * vec3(1.075, 0.955, 0.945), clamp(u_fx.w * cheek, 0.0, 1.0));
  float band = (p.y - u_fx.z) / 2.6;
  rgb += vec3(0.07, 0.19, 0.19) * u_fx.y * exp(-band * band);
  rgb *= u_grade.y;
  gl_FragColor = vec4(clamp(rgb, 0.0, 1.0) * c.a, c.a);
}`;

  function smooth(e0, e1, x) { const t = Math.min(1, Math.max(0, (x-e0)/(e1-e0))); return t*t*(3-2*t); }
  function ellipseWeight(x, y, e, feather) {
    const nx = (x-e[0])/e[2], ny = (y-e[1])/e[3], r = Math.sqrt(nx*nx+ny*ny);
    return r <= 1 ? 1 : 1-smooth(0, feather, (r-1)*Math.min(e[2], e[3]));
  }
  function axis(bands) {
    const out = [];
    for (const [a, b, step] of bands) for (let v = a; v < b; v += step) if (!out.length || v > out[out.length-1]) out.push(v);
    out.push(bands[bands.length-1][1]);
    return out;
  }
  /* Per-vertex weights: head turn region, breathing chest, shoulder lift, wind-moved hair. */
  function buildMesh(data) {
    const xs = axis(data.MESH.xBands), ys = axis(data.MESH.yBands), H = data.HEAD, B = data.BODY;
    const count = xs.length*ys.length, pos = new Float32Array(count*2), w = new Float32Array(count*4), depth = new Float32Array(count);
    let i = 0;
    for (const y of ys) for (const x of xs) {
      const neck = y < H.neckTop ? 1 : 1-smooth(H.neckTop, H.neckBottom, y);
      const neckBand = smooth(H.neck[0]-14, H.neck[0]+4, x)*(1-smooth(H.neck[1]-4, H.neck[1]+14, x));
      let head = ellipseWeight(x, y, H.ellipse, H.feather)*(y < H.neckTop ? 1 : neck*Math.max(neckBand, y < H.neckTop+20 ? .6 : 0));
      for (const s of H.strands) head = Math.max(head, .88*ellipseWeight(x, y, s, 18));
      const chest = smooth(426, 492, y)*(1-head);
      const shoulder = smooth(430, 484, y)*(1-.72*smooth(560, 760, y))*(1-head);
      let hair = 0;
      for (const s of B.hair.strands) hair = Math.max(hair, ellipseWeight(x, y, s, 22)*smooth(s[1]-s[3], s[1]+s[3]*.6, y));
      hair = Math.max(hair, .35*ellipseWeight(x, y, B.hair.crown, 20)*(1-smooth(120, 205, y)));
      const dc = H.depth.centre, dr = H.depth.radii, n = H.depth.nose, l = H.depth.lips;
      const ex = (x-dc[0])/dr[0], ey = (y-dc[1])/dr[1];
      let d = Math.sqrt(Math.max(0, 1-ex*ex-ey*ey));
      d += n[4]*Math.exp(-(((x-n[0])/n[2])**2+((y-n[1])/n[3])**2)) + l[4]*Math.exp(-(((x-l[0])/l[2])**2+((y-l[1])/l[3])**2));
      pos[i*2] = x; pos[i*2+1] = y;
      w[i*4] = head; w[i*4+1] = chest; w[i*4+2] = shoulder; w[i*4+3] = hair; depth[i] = d;
      i++;
    }
    const cols = xs.length, quads = (xs.length-1)*(ys.length-1);
    const index = count > 65535 ? new Uint32Array(quads*6) : new Uint16Array(quads*6);
    let k = 0;
    for (let r = 0; r < ys.length-1; r++) for (let c = 0; c < cols-1; c++) {
      const a = r*cols+c, b = a+1, d2 = a+cols, e = d2+1;
      index[k++] = a; index[k++] = d2; index[k++] = b; index[k++] = b; index[k++] = d2; index[k++] = e;
    }
    return {pos, w, depth, index, count, triangles:quads*2, xs, ys};
  }
  /* Feature displacements (image px) from the pose; order matches the handle list. */
  function handles(data, face) {
    const F = data.FEATURES, list = [];
    const browRaiseL = 1-.5*Math.max(0, face.browAsym), browRaiseR = 1+Math.max(0, face.browAsym);
    const brow = (h, side, kind) => {
      const raise = side < 0 ? browRaiseL : browRaiseR, inward = side < 0 ? 1 : -1;
      let dx = 0, dy = 0;
      if (kind === 'inner') { dy = -3.8*face.browInnerUp*raise+2.5*face.browDown; dx = 1.8*face.browSqueeze*inward; }
      if (kind === 'mid') dy = -(1.9*face.browInnerUp+2.7*face.browOuterUp)*raise+1.7*face.browDown;
      if (kind === 'outer') dy = -3.4*face.browOuterUp*raise+.8*face.browDown+.7*face.browInnerUp;
      list.push([h, dx, dy]);
    };
    for (const kind of ['inner','mid','outer']) { brow(F.browLeft[kind], -1, kind); brow(F.browRight[kind], 1, kind); }
    const smile = face.smile, up = smile >= 0 ? 2.9*smile : 2.3*smile, out = smile >= 0 ? 1.5*smile : .5*smile;
    list.push([F.mouthLeft, -out+1.2*face.mouthPress, -up]);
    list.push([F.mouthRight, out-1.2*face.mouthPress, -up]);
    list.push([F.cheekLeft, -.8*face.cheekRaise, -2.6*face.cheekRaise]);
    list.push([F.cheekRight, .8*face.cheekRaise, -2.6*face.cheekRaise]);
    list.push([F.lowerLidLeft, 0, -1.5*face.squint]);
    list.push([F.lowerLidRight, 0, -1.5*face.squint]);
    list.push([F.upperLip, 0, .8*face.mouthPress-.25*face.lipPart]);
    list.push([F.lowerLip, 0, -1*face.mouthPress+1.9*face.lipPart]);
    list.push([F.chin, 0, 1.2*face.lipPart]);
    while (list.length < HANDLES) list.push([[0, 0, 1, 1], 0, 0]);
    return list;
  }
  function compile(gl, type, source) {
    const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error('shader: '+log); }
    return s;
  }
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const rot = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [c*v[0]-s*v[1], s*v[0]+c*v[1]]; };
  const affine = (m, x, y) => [m[0]*x+m[1]*y+m[2], m[3]*x+m[4]*y+m[5]];
  function segDist(p, a, b) {
    const dx = b[0]-a[0], dy = b[1]-a[1], t = clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy), 0, 1);
    return Math.hypot(p[0]-a[0]-t*dx, p[1]-a[1]-t*dy);
  }
  /* 1 inside the polygon, 0 outside, smooth across a band of +-feather pixels. */
  function polygonWeight(x, y, poly, feather) {
    let inside = false, d = Infinity;
    for (let i = 0, j = poly.length-1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) inside = !inside;
      d = Math.min(d, segDist([x, y], poly[i], poly[j]));
    }
    return smooth(-feather, feather, inside ? d : -d);
  }
  function depthAt(x, y, H) {
    const dc = H.depth.centre, dr = H.depth.radii, n = H.depth.nose, l = H.depth.lips;
    const ex = (x-dc[0])/dr[0], ey = (y-dc[1])/dr[1];
    return Math.sqrt(Math.max(0, 1-ex*ex-ey*ey))+n[4]*Math.exp(-(((x-n[0])/n[2])**2+((y-n[1])/n[3])**2))+l[4]*Math.exp(-(((x-l[0])/l[2])**2+((y-l[1])/l[3])**2));
  }
  /* Where a fully head-weighted rest point lands for this pose (mirrors the vertex shader). */
  function headPoint(p, pose, data) {
    const H = data.HEAD, B = data.BODY, d = depthAt(p[0], p[1], H), hd = pose.head, b = pose.body;
    let x = p[0]+H.yawPx*hd.yaw*d+H.yawRigidPx*hd.yaw, y = p[1]+H.pitchPx*hd.pitch*d+H.pitchRigidPx*hd.pitch;
    const r = rot([x-H.pivot[0], y-H.pivot[1]], hd.roll*H.rollDeg*Math.PI/180);
    x = H.pivot[0]+r[0]; y = H.pivot[1]+r[1]-b.shoulderLift*B.shoulderLiftPx*.55;
    return [x+b.lean*B.leanPx*(1-p[1]/800)+(b.shiver || 0)*.9, y];
  }
  /* Arm pieces: a grid over each atlas rectangle, rest positions on the canonical portrait,
   * and a forearm weight (1 = forearm/hand bone, 0 = upper-arm bone). */
  function buildArms(data) {
    const A = data.ARMS, out = {};
    for (const [name, piece] of Object.entries(A.pieces)) {
      const [ax, ay, aw, ah] = piece.atlas, [sx, sy] = piece.source, [nx, ny] = piece.grid, B = piece.bones;
      const cols = nx+1, rows = ny+1, count = cols*rows;
      const src = new Float32Array(count*2), uv = new Float32Array(count*2), rest = new Float32Array(count*2), fore = new Float32Array(count);
      for (let r = 0, i = 0; r < rows; r++) for (let c = 0; c < cols; c++, i++) {
        const u = c/nx, v = r/ny, px = sx+u*aw, py = sy+v*ah, [wx, wy] = affine(piece.matrix, px, py);
        src[i*2] = px; src[i*2+1] = py; uv[i*2] = (ax+u*aw)/A.atlas.width; uv[i*2+1] = (ay+v*ah)/A.atlas.height;
        rest[i*2] = wx; rest[i*2+1] = wy;
        fore[i] = B.shoulder ? smooth(-16, 16, segDist([wx, wy], B.shoulder, B.elbow)-Math.min(segDist([wx, wy], B.elbow, B.wrist), segDist([wx, wy], B.wrist, B.hand))) : 1;
      }
      const index = new Uint16Array(nx*ny*6);
      for (let r = 0, k = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
        const a = r*cols+c, b = a+1, d = a+cols, e = d+1;
        index.set([a, d, b, b, d, e], k); k += 6;
      }
      out[name] = {piece, src, uv, rest, fore, index, count, pos:new Float32Array(count*2)};
    }
    return out;
  }
  /* Body sway that every attached layer shares with the torso. */
  function bodyFollow(pose, data, y) {
    const b = pose.body, B = data.BODY;
    return [b.lean*B.leanPx*(1-y/800)+(b.shiver || 0)*.9, -(b.breath*B.breathPx+b.shoulderLift*B.shoulderLiftPx*.8)];
  }
  /* Heat wipe: the upper arm swings up from the hanging pose (shortening as it comes forward),
   * the forearm sweeps in front of the chest to the forehead, then follows the head and strokes. */
  function skinWipe(arm, pose, data) {
    const B = arm.piece.bones, S = B.shoulder, E = B.elbow, W = B.wrist, Hd = B.hand, right = pose.arms.right;
    const raise = right.mode === 'wipe' ? right.raise : 0;
    if (raise < .04) return 0;
    const ru = smooth(0, .6, raise), rf = smooth(.15, 1, raise);
    const restU = Math.atan2(E[1]-S[1], E[0]-S[0]), restF = Math.atan2(W[1]-E[1], W[0]-E[0]);
    const au = (1-ru)*(Math.atan2(1, -.12)-restU), ku = 1+(1-ru)*.55, dirU = [Math.cos(restU), Math.sin(restU)];
    // Hanging, the arm starts from the canonical shoulder joint; raised, the shoulder rolls forward.
    const J = data.ARMS.rightShoulder, Sp = [S[0]+(1-ru)*(J[0]-S[0]), S[1]+(1-ru)*(J[1]-S[1])];
    const tU = (x, y) => {
      const v = [x-S[0], y-S[1]], par = (v[0]*dirU[0]+v[1]*dirU[1])*(ku-1), r = rot([v[0]+dirU[0]*par, v[1]+dirU[1]*par], au);
      return [Sp[0]+r[0], Sp[1]+r[1]];
    };
    const E2 = tU(E[0], E[1]), target = headPoint(Hd, pose, data), stroke = right.stroke || 0;
    target[0] += 7*stroke; target[1] -= 1.5*stroke;
    const hv = [Hd[0]-E[0], Hd[1]-E[1]], tv = [target[0]-E2[0], target[1]-E2[1]];
    const ac = Math.atan2(tv[1], tv[0])-Math.atan2(hv[1], hv[0]), sc = clamp(Math.hypot(tv[0], tv[1])/Math.hypot(hv[0], hv[1]), .94, 1.06);
    // Mid-swing the forearm points toward the viewer, so it shortens along its own axis.
    const af = (1-rf)*(Math.atan2(1, .1)-restF)+rf*ac, sf = 1+rf*(sc-1), fore = 1-.55*Math.sin(Math.PI*(1-rf));
    const dirF = [Math.cos(restF), Math.sin(restF)];
    for (let i = 0; i < arm.count; i++) {
      const x = arm.rest[i*2], y = arm.rest[i*2+1], w = arm.fore[i], u = tU(x, y), fo = bodyFollow(pose, data, y);
      const v = [(x-E[0])*sf, (y-E[1])*sf], along = (v[0]*dirF[0]+v[1]*dirF[1])*(fore-1), f = rot([v[0]+dirF[0]*along, v[1]+dirF[1]*along], af);
      arm.pos[i*2] = (E2[0]+f[0])*w+u[0]*(1-w)+fo[0]; arm.pos[i*2+1] = (E2[1]+f[1])*w+u[1]*(1-w)+fo[1];
    }
    return smooth(.04, .14, raise);
  }
  /* Umbrella hand: the forearm rises about the elbow in front of the hanging upper arm. */
  function skinUmbrella(arm, pose, data) {
    const B = arm.piece.bones, P = B.elbow, um = pose.umbrella;
    const a = data.UMBRELLA.holdTiltDeg*Math.PI/180+(1-um.reach)*2.97+(um.sway || 0);
    for (let i = 0; i < arm.count; i++) {
      const x = arm.rest[i*2], y = arm.rest[i*2+1], r = rot([x-P[0], y-P[1]], a), fo = bodyFollow(pose, data, y);
      arm.pos[i*2] = P[0]+r[0]+fo[0]; arm.pos[i*2+1] = P[1]+r[1]+fo[1];
    }
    const fo = bodyFollow(pose, data, 560), g = p => { const r = rot([p[0]-P[0], p[1]-P[1]], a); return [P[0]+r[0]+fo[0], P[1]+r[1]+fo[1]]; };
    return {alpha:smooth(0, .15, um.reach), low:g(B.gripLow), high:g(B.gripHigh)};
  }
  /* Cold wrap: a forearm sweeps inward about its elbow (below the frame) from hanging to
   * gripping the opposite upper arm; it rises with the lifted shoulders and rubs gently. */
  function skinWrap(arm, pose, data) {
    const B = arm.piece.bones, P = B.elbow, H = B.hand, w = pose.wrap, k = w.arms;
    let off = Math.atan2(H[1]-P[1], H[0]-P[0])-Math.PI/2;
    while (off > Math.PI) off -= Math.PI*2; while (off <= -Math.PI) off += Math.PI*2;
    const a = -(1-k)*off+(w.rub || 0)*.025*Math.sign(off);
    for (let i = 0; i < arm.count; i++) {
      const x = arm.rest[i*2], y = arm.rest[i*2+1], r = rot([x-P[0], y-P[1]], a), fo = bodyFollow(pose, data, y);
      arm.pos[i*2] = P[0]+r[0]+fo[0]; arm.pos[i*2+1] = P[1]+r[1]+fo[1];
    }
    return w.amount > 0 ? smooth(0, .12, k) : 0;
  }
  /* Triangle batch with premultiplied colour: [x, y, r, g, b, a] per vertex. */
  function Batch(capacity) {
    let buf = new Float32Array(capacity*6), n = 0;
    const grow = need => { if ((n+need)*6 > buf.length) { const next = new Float32Array(Math.max(buf.length*2, (n+need)*6)); next.set(buf); buf = next; } };
    // c[4] (optional) adds emission: premultiplied colour above alpha glows additively, like light.
    const vxy = (x, y, c) => { const e = 1+(c[4] || 0), i = n*6; buf[i] = x; buf[i+1] = y; buf[i+2] = c[0]*c[3]*e; buf[i+3] = c[1]*c[3]*e; buf[i+4] = c[2]*c[3]*e; buf[i+5] = c[3]; n++; };
    const vert = (p, c) => vxy(p[0], p[1], c);
    const api = {
      tri(a, b, c, ca, cb, cc) { grow(3); vert(a, ca); vert(b, cb || ca); vert(c, cc || ca); },
      line(a, b, width, ca, cb) {
        // Two triangles written in place: no temporary vectors per segment (rain draws hundreds).
        const dx = b[0]-a[0], dy = b[1]-a[1], l = Math.hypot(dx, dy) || 1, nx = -dy/l*width/2, ny = dx/l*width/2, c2 = cb || ca;
        grow(6);
        vxy(a[0]+nx, a[1]+ny, ca); vxy(a[0]-nx, a[1]-ny, ca); vxy(b[0]+nx, b[1]+ny, c2);
        vxy(b[0]+nx, b[1]+ny, c2); vxy(a[0]-nx, a[1]-ny, ca); vxy(b[0]-nx, b[1]-ny, c2);
      },
      disc(c, r, ci, co, seg) {
        for (let k = 0; k < seg; k++) {
          const t0 = k/seg*Math.PI*2, t1 = (k+1)/seg*Math.PI*2;
          api.tri(c, [c[0]+Math.cos(t0)*r, c[1]+Math.sin(t0)*r], [c[0]+Math.cos(t1)*r, c[1]+Math.sin(t1)*r], ci, co, co);
        }
      },
      reset() { n = 0; },
      get count() { return n; },
      get array() { return buf.subarray(0, n*6); }
    };
    return api;
  }
  /* Holographic umbrella in canonical space: shaft from the fist to the apex, ribs as hinged
   * arcs that fold along the shaft when closed, translucent panels, materialising upward. */
  function umbrellaGeometry(um, grip, data, back, front) {
    const U = data.UMBRELLA, up = [grip.high[0]-grip.low[0], grip.high[1]-grip.low[1]], ul = Math.hypot(up[0], up[1]) || 1;
    const u = [up[0]/ul, up[1]/ul], d = [-u[0], -u[1]], n = [-d[1], d[0]], shaft = 455;
    const apex = [grip.high[0]+u[0]*shaft, grip.high[1]+u[1]*shaft], m = um.materialize, o = um.open;
    const ease = o < 1 ? 1-Math.pow(1-o, 3)+Math.sin(o*Math.PI)*.06 : 1;
    const b0 = (U.closedDeg+(88-U.closedDeg)*ease)*Math.PI/180, db = -52*ease*Math.PI/180, K = 7, L = U.ribLength;
    const prof = [[0, 0]]; let rad = 0, dn = 0;
    for (let i = 1; i <= K; i++) { const bt = b0+db*(i-.5)/K; rad += Math.sin(bt)*L/K; dn += Math.cos(bt)*L/K; prof.push([rad, dn]); }
    // Seen slightly from below: the near half of the canopy drops, so the rim reads as an ellipse.
    const world = (x, y, z) => { const yy = y+(z || 0)*.16; return [apex[0]+n[0]*x+d[0]*yy, apex[1]+n[1]*x+d[1]*yy]; };
    // Reveal runs from the fist (0) to just above the apex (1); a bright front marks it.
    const reveal = p => { const q = [p[0]-grip.high[0], p[1]-grip.high[1]]; return clamp((q[0]*u[0]+q[1]*u[1])/(shaft+20), 0, 1); };
    const cyan = [.62, .95, 1], gold = [.9, .79, .56], rim = [.8, .98, 1], N = U.ribs, phase = .17;
    const col = (c, p, a) => {
      const r = reveal(p), shown = smooth(r-.07, r, m*1.08), g = m < 1 ? Math.exp(-(((r-m*1.08)/.045)**2))*.6 : 0;
      return [Math.min(1, c[0]+g*.3), Math.min(1, c[1]+g*.4), Math.min(1, c[2]+g*.4), Math.min(1, a*shown+g*.35*shown), c === gold ? .1 : c === rim ? .8 : .35];
    };
    for (let k = 0; k < N; k++) {
      const f0 = phase+k/N*Math.PI*2, f1 = phase+(k+1)/N*Math.PI*2, fm = (f0+f1)/2, isFront = Math.cos(fm) > 0;
      const batch = isFront ? front : back, fres = .6+.6*Math.abs(Math.sin(fm)), w = isFront ? 1 : .5;
      for (let i = 0; i < K; i++) {
        const a0 = prof[i], a1 = prof[i+1], al0 = (.06+.2*i/K)*fres*w, al1 = (.06+.2*(i+1)/K)*fres*w;
        const p00 = world(a0[0]*Math.sin(f0), a0[1], a0[0]*Math.cos(f0)), p01 = world(a0[0]*Math.sin(f1), a0[1], a0[0]*Math.cos(f1));
        const p10 = world(a1[0]*Math.sin(f0), a1[1], a1[0]*Math.cos(f0)), p11 = world(a1[0]*Math.sin(f1), a1[1], a1[0]*Math.cos(f1));
        batch.tri(p00, p10, p01, col(cyan, p00, al0), col(cyan, p10, al1), col(cyan, p01, al0));
        batch.tri(p01, p10, p11, col(cyan, p01, al0), col(cyan, p10, al1), col(cyan, p11, al1));
      }
      const t0 = world(prof[K][0]*Math.sin(f0), prof[K][1], prof[K][0]*Math.cos(f0)), t1 = world(prof[K][0]*Math.sin(f1), prof[K][1], prof[K][0]*Math.cos(f1));
      batch.line(t0, t1, 1.8, col(rim, t0, .7*w), col(rim, t1, .7*w));
    }
    for (let k = 0; k < N; k++) {
      const f = phase+k/N*Math.PI*2, isFront = Math.cos(f) > 0, batch = isFront ? front : back, a = isFront ? .85 : .35;
      for (let i = 0; i < K; i++) {
        const p0 = world(prof[i][0]*Math.sin(f), prof[i][1], prof[i][0]*Math.cos(f)), p1 = world(prof[i+1][0]*Math.sin(f), prof[i+1][1], prof[i+1][0]*Math.cos(f));
        batch.line(p0, p1, 1.5, col(gold, p0, a), col(gold, p1, a));
      }
    }
    return {apex, u, d, n, silhouette:prof, radius:prof[K][0], col, gold,
      shaft:[[grip.high[0]-u[0]*8, grip.high[1]-u[1]*8], [apex[0]+u[0]*18, apex[1]+u[1]*18]]};
  }
  /* Rain: a pool of drops in canonical space (wider than the portrait), part of it behind the
   * figure. Front drops that meet the open canopy splash, and the rim drips, instead of passing. */
  function Rain(seed) {
    let s = (seed >>> 0) || 7;
    const rnd = () => { s = (Math.imul(s, 1664525)+1013904223) >>> 0; return s/4294967296; };
    const drops = [], splashes = [], puffs = [];
    let last = null, drip = 0, nextPuff = 0;
    const spawn = (dr, top) => { dr.x = -240+rnd()*1080; dr.y = top ? -40-rnd()*120 : -40+rnd()*860; dr.v = 900+rnd()*420; dr.len = 13+rnd()*10; dr.back = rnd() < .45; return dr; };
    function canopyTop(umb, ax) {
      const sil = umb.silhouette;
      for (let i = 1; i < sil.length; i++) if (ax <= sil[i][0]) { const t = (ax-sil[i-1][0])/Math.max(1e-3, sil[i][0]-sil[i-1][0]); return sil[i-1][1]+t*(sil[i][1]-sil[i-1][1]); }
      return sil[sil.length-1][1];
    }
    function step(pose, umb, data) {
      const dt = last === null || pose.reducedMotion ? 0 : clamp((pose.t-last)/1000, 0, .05); last = pose.t;
      const env = pose.env, want = Math.round(env.rain*(pose.reducedMotion ? 70 : 150));
      while (drops.length < want) drops.push(spawn({}, false));
      if (drops.length > want) drops.length = want;
      const slant = .07+.2*env.wind*env.windDir;
      const open = !!umb && umb.radius > 120 && pose.umbrella.materialize > .9 && pose.umbrella.open > .7;
      for (const dr of drops) {
        dr.y += dr.v*dt; dr.x += dr.v*slant*dt;
        if (open && !dr.back) {
          const q = [dr.x-umb.apex[0], dr.y-umb.apex[1]], xl = q[0]*umb.n[0]+q[1]*umb.n[1], yl = q[0]*umb.d[0]+q[1]*umb.d[1], ax = Math.abs(xl);
          if (ax < umb.radius) {
            const top = canopyTop(umb, ax);
            if (yl >= top && yl < top+40) {
              for (let k = 0; k < 2; k++) splashes.push({x:dr.x, y:dr.y, vx:(rnd()-.5)*220, vy:-(80+rnd()*120), life:.28+rnd()*.14, age:0});
              spawn(dr, true); continue;
            }
          }
        }
        if (dr.y > 840 || dr.x > 860 || dr.x < -260) spawn(dr, true);
      }
      if (open && env.rain > .05 && dt > 0) {
        drip += dt;
        if (drip > .12) {
          drip = 0; const side = rnd() < .5 ? -1 : 1, x = side*umb.radius*.97, y = umb.silhouette[umb.silhouette.length-1][1];
          splashes.push({x:umb.apex[0]+umb.n[0]*x+umb.d[0]*y, y:umb.apex[1]+umb.n[1]*x+umb.d[1]*y, vx:side*20, vy:60, life:.6, age:0, drip:true});
        }
      }
      for (const sp of splashes) { sp.age += dt; sp.vy += 1400*dt; sp.x += sp.vx*dt; sp.y += sp.vy*dt; }
      for (let i = splashes.length-1; i >= 0; i--) if (splashes[i].age > splashes[i].life) splashes.splice(i, 1);
      // Cold: occasional breath vapour from the mouth.
      if (env.cold > .5 && dt > 0 && pose.t > nextPuff) {
        nextPuff = pose.t+3200+rnd()*1600; const mo = headPoint([302, 386], pose, data);
        puffs.push({x:mo[0], y:mo[1]+4, age:0, life:1.5, dx:(rnd()-.5)*14});
      }
      for (const pf of puffs) pf.age += dt;
      for (let i = puffs.length-1; i >= 0; i--) if (puffs[i].age > puffs[i].life || env.cold < .2) puffs.splice(i, 1);
      return slant;
    }
    function draw(back, front, slant, storm) {
      const a = .26+.12*storm;
      for (const dr of drops) {
        const batch = dr.back ? back : front, c = dr.back ? [.7, .85, .95, a*.5] : [.78, .92, 1, a];
        batch.line([dr.x, dr.y], [dr.x-slant*dr.len, dr.y-dr.len], dr.back ? .8 : 1.15, c, [c[0], c[1], c[2], 0]);
      }
      for (const sp of splashes) { const k = 1-sp.age/sp.life; front.disc([sp.x, sp.y], sp.drip ? 1.4 : 1.2, [.85, .96, 1, .7*k], [.85, .96, 1, 0], 6); }
      for (const pf of puffs) {
        const k = pf.age/pf.life, r = 6+22*k;
        front.disc([pf.x+pf.dx*k, pf.y-6*k], r, [.92, .96, 1, .16*(1-k)*Math.min(1, k*6)], [.92, .96, 1, 0], 14);
      }
    }
    return {step, draw, get drops() { return drops.length; }, get splashes() { return splashes.length; }, get puffs() { return puffs.length; }};
  }

  function create(config) {
    const data = config.data || root.JangeAssistantRigData, canvas = config.canvas;
    if (!data || !canvas || !config.idle || !config.blink) return null;
    const attrs = {alpha:true, premultipliedAlpha:true, antialias:true, depth:false, stencil:false, preserveDrawingBuffer:false, powerPreference:'low-power'};
    let gl = null;
    try { gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs); } catch (e) { gl = null; }
    if (!gl) return null;
    const mesh = buildMesh(data), arms = config.arms ? buildArms(data) : null, rain = Rain(config.seed || 7);
    const curves = {left:data.curves(data.EYES.left), right:data.curves(data.EYES.right)};
    const back = Batch(4096), front = Batch(8192), mid = Batch(64);
    let program, layer, color, buffers = [], textures = [], lost = false, dpr = 1, maxDpr = 2, view = [1, 1, 0, 0], scale = 1, lastPose = null;
    let bodyBuf = {}, colorBuf = null, colorCap = 0, enabled = [], stats = {arms:0, umbrella:false, drops:0, splashes:0, puffs:0};
    const loc = {}, lloc = {}, cloc = {}, armBuf = {};
    const attribCache = new Map(); let programIds = 0;
    const link = (vs, fs) => {
      const p = gl.createProgram(); p.__id = 'p'+(++programIds)+':'; gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: '+gl.getProgramInfoLog(p));
      return p;
    };
    const buffer = (array, target, usage) => {
      const b = gl.createBuffer(); buffers.push(b); gl.bindBuffer(target || gl.ARRAY_BUFFER, b); gl.bufferData(target || gl.ARRAY_BUFFER, array, usage || gl.STATIC_DRAW); return b;
    };
    // Each draw enables exactly its own attribute arrays.
    function attribs(prog, list) {
      for (const l of enabled) gl.disableVertexAttribArray(l);
      enabled = [];
      for (const [name, buf, size, stride, offset] of list) {
        // Locations are cached: on out-of-process GPUs each query is a synchronous round trip.
        const key = prog.__id+name; let l = attribCache.get(key);
        if (l === undefined) { l = gl.getAttribLocation(prog, name); attribCache.set(key, l); }
        if (l < 0) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, stride || 0, offset || 0); enabled.push(l);
      }
    }
    function texture(img, unit) {
      const t = gl.createTexture(); textures.push(t); gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    function init() {
      program = link(VERT, FRAG); layer = link(LAYER_VERT, LAYER_FRAG); color = link(COLOR_VERT, COLOR_FRAG);
      for (const name of ['u_h','u_d','u_head','u_roll','u_body','u_misc','u_view','u_arm','u_hide','u_idle','u_blink','u_lo','u_lc','u_ll','u_lt','u_lb','u_lx',
        'u_ro','u_rc','u_rl','u_rt','u_rb','u_rx','u_eye','u_grade','u_fx','u_cheeks']) loc[name] = gl.getUniformLocation(program, name);
      for (const name of ['u_view','u_tex','u_alpha','u_grade','u_fx','u_stub','u_stubAlpha']) lloc[name] = gl.getUniformLocation(layer, name);
      for (const name of ['u_view','u_flash']) cloc[name] = gl.getUniformLocation(color, name);
      if (mesh.index instanceof Uint32Array && !gl.getExtension('OES_element_index_uint')) throw new Error('mesh too dense');
      const arm = new Float32Array(mesh.count*2), A = data.ARMS;
      for (let i = 0; i < mesh.count; i++) { const w = polygonWeight(mesh.pos[i*2], mesh.pos[i*2+1], A.hideRight, 6); arm[i*2] = w; arm[i*2+1] = w; }
      bodyBuf = {pos:buffer(mesh.pos), w:buffer(mesh.w), depth:buffer(mesh.depth), arm:buffer(arm), index:buffer(mesh.index, gl.ELEMENT_ARRAY_BUFFER)};
      texture(config.idle, 0); texture(config.blink, 1);
      if (arms) {
        texture(config.arms, 2);
        for (const [name, a] of Object.entries(arms)) armBuf[name] = {pos:buffer(a.pos, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW), uv:buffer(a.uv), src:buffer(a.src), index:buffer(a.index, gl.ELEMENT_ARRAY_BUFFER)};
      }
      colorBuf = buffer(new Float32Array(6), gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
      gl.useProgram(program);
      gl.uniform1i(loc.u_idle, 0); gl.uniform1i(loc.u_blink, 1);
      const eyeUniforms = (prefix, c, e) => {
        for (const [key, name] of [['open','o'],['closed','c'],['lower','l'],['top','t'],['bottom','b']]) gl.uniform4fv(loc['u_'+prefix+name], c[key]);
        gl.uniform4f(loc['u_'+prefix+'x'], e.x0, e.x1, e.iris[0], e.iris[1]);
      };
      eyeUniforms('l', curves.left, data.EYES.left); eyeUniforms('r', curves.right, data.EYES.right);
      gl.uniform4f(loc.u_cheeks, data.FEATURES.cheekLeft[0], data.FEATURES.cheekLeft[1], data.FEATURES.cheekRight[0], data.FEATURES.cheekRight[1]);
      gl.useProgram(layer); gl.uniform1i(lloc.u_tex, 2);
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
    }
    function resize() {
      const box = canvas.getBoundingClientRect(), w = Math.max(1, box.width), h = Math.max(1, box.height);
      dpr = Math.min(root.devicePixelRatio || 1, maxDpr);
      const bw = Math.round(w*dpr), bh = Math.round(h*dpr);
      if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
      scale = Math.min(h/data.MESH.height, w/data.MESH.width);
      const ox = (w-data.MESH.width*scale)/2, oy = (h-data.MESH.height*scale)/2;
      view = [2*scale/w, -2*scale/h, 2*ox/w-1, 1-2*oy/h];
      return {width:w, height:h, scale};
    }
    function drawBatch(batch, flash) {
      if (!batch.count) return;
      gl.useProgram(color); gl.uniform4fv(cloc.u_view, view); gl.uniform1f(cloc.u_flash, flash);
      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
      if (batch.array.byteLength > colorCap) { colorCap = batch.array.byteLength*2; gl.bufferData(gl.ARRAY_BUFFER, colorCap, gl.DYNAMIC_DRAW); }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.array);
      attribs(color, [['a_pos', colorBuf, 2, 24, 0], ['a_col', colorBuf, 4, 24, 8]]);
      gl.drawArrays(gl.TRIANGLES, 0, batch.count);
    }
    function drawArm(name, alpha, L, stubAlpha) {
      if (!arms || !(alpha > .002)) return;
      const a = arms[name], b = armBuf[name], stub = a.piece.stub || [0, 0, 0, 0];
      gl.useProgram(layer); gl.uniform4fv(lloc.u_view, view); gl.uniform1f(lloc.u_alpha, alpha);
      gl.uniform4f(lloc.u_grade, L.warmth, L.bright, L.desat, L.wet); gl.uniform4f(lloc.u_fx, L.flash || 0, 0, 0, 0);
      gl.uniform4f(lloc.u_stub, stub[0], stub[1], stub[2], stub[3]); gl.uniform1f(lloc.u_stubAlpha, stubAlpha);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.pos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, a.pos);
      attribs(layer, [['a_pos', b.pos, 2], ['a_uv', b.uv, 2], ['a_src', b.src, 2]]);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.index); gl.drawElements(gl.TRIANGLES, a.index.length, gl.UNSIGNED_SHORT, 0);
    }
    // CPU work for a pose: skinning, umbrella geometry, rain and breath. Kept separate from the
    // GPU submission so a burst of frames inside one task (a throttled tab catching up, a test
    // clock) still simulates every step but submits only the latest state.
    let frame = null;
    function compute(pose) {
      lastPose = pose;
      const wipeAlpha = arms ? skinWipe(arms.wipe, pose, data) : 0;
      const grip = arms && pose.umbrella.amount > 0 ? skinUmbrella(arms.umbrella, pose, data) : null;
      const wrapAlpha = arms && pose.wrap.amount > 0 ? Math.min(skinWrap(arms.wrapBack, pose, data), skinWrap(arms.wrapFront, pose, data)) : 0;
      back.reset(); front.reset(); mid.reset();
      const umb = grip && pose.umbrella.materialize > 0 ? umbrellaGeometry(pose.umbrella, grip, data, back, front) : null;
      if (umb) mid.line(umb.shaft[0], umb.shaft[1], 3.2, umb.col(umb.gold, umb.shaft[0], .95), umb.col(umb.gold, umb.shaft[1], .95));
      const slant = rain.step(pose, umb, data);
      rain.draw(back, front, slant, pose.env.storm);
      frame = {pose, wipeAlpha, grip, wrapAlpha};
      stats = {arms:(wipeAlpha > 0 ? 1 : 0)+(grip && grip.alpha > 0 ? 1 : 0)+(wrapAlpha > 0 ? 2 : 0), umbrella:!!umb, drops:rain.drops, splashes:rain.splashes, puffs:rain.puffs};
    }
    function draw() {
      if (!frame || lost) return false;
      const {pose, wipeAlpha, grip, wrapAlpha} = frame;
      const f = pose.face, hd = pose.head, b = pose.body, H = data.HEAD, B = data.BODY, L = pose.light, lim = data.LIMITS, A = data.ARMS;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      drawBatch(back, L.flash || 0);
      gl.useProgram(program);
      attribs(program, [['a_pos', bodyBuf.pos, 2], ['a_w', bodyBuf.w, 4], ['a_depth', bodyBuf.depth, 1], ['a_arm', bodyBuf.arm, 2]]);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bodyBuf.index);
      handles(data, f).forEach(([h, dx, dy], i) => { handleV.set(h, i*4); dispV[i*4] = dx; dispV[i*4+1] = dy; });
      gl.uniform4fv(loc.u_h, handleV); gl.uniform4fv(loc.u_d, dispV);
      gl.uniform4f(loc.u_head, H.yawPx*hd.yaw, H.yawRigidPx*hd.yaw, H.pitchPx*hd.pitch, H.pitchRigidPx*hd.pitch);
      gl.uniform3f(loc.u_roll, H.pivot[0], H.pivot[1], hd.roll*H.rollDeg*Math.PI/180);
      gl.uniform4f(loc.u_body, b.breath*B.breathPx, b.breath*B.chestScale, b.shoulderLift*B.shoulderLiftPx, b.lean*B.leanPx);
      gl.uniform4f(loc.u_misc, (pose.hair.wind || 0)*4.5, (b.shiver || 0)*.9, 0, 0);
      gl.uniform4fv(loc.u_view, view);
      const lift = pose.arms.right.mode === 'wipe' ? pose.arms.right.raise : 0;
      gl.uniform4f(loc.u_arm, .16*smooth(0, .25, lift), 0, A.rightShoulder[0], A.rightShoulder[1]);
      gl.uniform1f(loc.u_hide, wipeAlpha);
      gl.uniform4f(loc.u_eye, f.lidL, f.lidR, f.gazeX*lim.gazePx[0], f.gazeY*lim.gazePx[1]);
      gl.uniform4f(loc.u_grade, L.warmth, L.bright, L.desat, L.wet);
      gl.uniform4f(loc.u_fx, L.flash || 0, L.scan*.55, 120+((pose.t/9)%640), f.blush);
      gl.drawElements(gl.TRIANGLES, mesh.index.length, mesh.index instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
      drawBatch(mid, L.flash || 0);
      drawArm('umbrella', grip ? grip.alpha : 0, L, pose.umbrella.materialize);
      drawArm('wipe', wipeAlpha, L, 1);
      drawArm('wrapBack', wrapAlpha, L, 1);
      drawArm('wrapFront', wrapAlpha, L, 1);
      drawBatch(front, L.flash || 0);
      return true;
    }
    const handleV = new Float32Array(HANDLES*4), dispV = new Float32Array(HANDLES*4);
    // One GPU submission per rendering frame. The animation timeline advances only when the
    // browser actually renders, so extra simulation steps inside one frame (a throttled tab
    // catching up, a test clock) update state but submit just the latest frame, next frame.
    let alive = true, lastFrame = null, pending = false, flush = 0;
    const frameTime = () => { const t = root.document && root.document.timeline ? root.document.timeline.currentTime : null; return typeof t === 'number' ? t : null; };
    function submit() { lastFrame = frameTime(); pending = false; return draw(); }
    function render(pose) {
      // Loss arrives as the webglcontextlost event; polling isContextLost() per frame would cost a
      // synchronous GPU-process round trip on WebKit.
      if (lost) return false;
      compute(pose);
      const t = frameTime();
      if (t === null || t !== lastFrame) return submit();
      pending = true;
      if (!flush && root.requestAnimationFrame) flush = root.requestAnimationFrame(() => { flush = 0; if (alive && pending && frameTime() !== lastFrame) submit(); });
      return true;
    }
    function destroy() {
      // A lost context is left for the browser to restore; a live one is released.
      if (!gl.isContextLost()) {
        buffers.forEach(x => gl.deleteBuffer(x)); textures.forEach(t => gl.deleteTexture(t)); [program, layer, color].forEach(p => p && gl.deleteProgram(p));
        const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
      }
      buffers = []; textures = [];
    }
    try { init(); } catch (e) { destroy(); return null; }
    resize();
    const onLost = e => { e.preventDefault(); lost = true; if (config.onLost) config.onLost(); };
    canvas.addEventListener('webglcontextlost', onLost);
    const info = (() => {
      const d = gl.getExtension('WEBGL_debug_renderer_info');
      return {renderer:d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vertices:mesh.count, triangles:mesh.triangles, arms:!!arms};
    })();
    // Diagnostics: re-render the last pose and read the frame back (bottom-up RGBA rows).
    function capture() {
      if (!lastPose || lost) return null;
      compute(lastPose); submit();
      const pixels = new Uint8Array(canvas.width*canvas.height*4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return {width:canvas.width, height:canvas.height, pixels, view:view.slice(), scale:scale*dpr};
    }
    return Object.freeze({
      render, resize, info, capture,
      setMaxPixelRatio(v) { maxDpr = Math.max(1, Math.min(2, v)); return resize(); },
      get lost() { return lost; },
      get lastPose() { return lastPose; },
      get stats() { return Object.assign({}, stats); },
      destroy() { canvas.removeEventListener('webglcontextlost', onLost); alive = false; if (flush && root.cancelAnimationFrame) root.cancelAnimationFrame(flush); destroy(); }
    });
  }
  return Object.freeze({create, buildMesh, buildArms, handles, headPoint, polygonWeight, HANDLES});
});
