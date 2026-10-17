/* Identity anchor for the expressive rig. Every coordinate is a pixel of the approved
 * canonical portrait brand/assistant/idle.webp (600x800); blink.webp supplies only the
 * closed-lid texture inside the eye zones. No other face is ever drawn by the rig.
 * Curves are three measured points (outer/top/inner) solved into y=c0+c1*dx+c2*dx^2.
 * "left"/"right" are the viewer's left and right. Data only: no DOM, clock or network. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JangeAssistantRigData = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const deepFreeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(deepFreeze); Object.freeze(value);
    }
    return value;
  };
  // Upper lash line open (idle), upper lash line closed (blink), lower lid (idle),
  // lid-zone top where idle and blink start to differ, and bottom of the closed lashes.
  const EYES = {
    left: {x0:236, x1:283, iris:[260,300], irisRadius:7,
      open:[[239,299],[262,290],[283,301]], closed:[[239,302],[260,308],[283,303]],
      lower:[[241,302],[260,309],[282,303]], top:[[239,296],[260,286],[283,299]],
      bottom:[[239,305],[260,315],[283,306]]},
    right: {x0:319, x1:368, iris:[340,294], irisRadius:8,
      open:[[320,299],[342,285],[366,291]], closed:[[320,300],[340,303],[366,295]],
      lower:[[322,300],[338,302],[364,295]], top:[[320,297],[342,280],[366,289]],
      bottom:[[320,303],[340,311],[366,298]]}
  };
  // Compact feature handles (centre, radii). Displacements are computed per frame.
  const FEATURES = {
    browLeft: {inner:[283,282,12,9], mid:[262,277,13,9], outer:[243,281,12,9]},
    browRight: {inner:[320,277,12,9], mid:[342,269,13,9], outer:[362,269,12,9]},
    cheekLeft:[255,338,24,20], cheekRight:[345,333,24,20],
    lowerLidLeft:[260,310,17,5], lowerLidRight:[340,303,17,5],
    mouthLeft:[271,377,10,9], mouthRight:[335,372,10,9],
    upperLip:[302,370,22,5], lowerLip:[302,387,26,8], chin:[302,414,60,24]
  };
  const HEAD = {
    // Soft region that turns with the head: skull, hair and loose strands, fading over the neck.
    ellipse:[300,255,138,178], feather:26, neckTop:398, neckBottom:468, neck:[246,356],
    strands:[[205,392,30,78],[396,382,30,78]],
    pivot:[300,456], // base of the neck: roll axis
    depth:{centre:[300,302], radii:[122,152], nose:[300,336,11,24,.28], lips:[302,380,22,11,.1]},
    yawPx:9, yawRigidPx:2.2, pitchPx:6, pitchRigidPx:1.4, rollDeg:3.4
  };
  const BODY = {
    shoulders:{top:448, bottom:600}, breathPx:1.15, chestScale:.0045, shoulderLiftPx:7,
    leanPx:3.2, hair:{strands:[[205,392,34,86],[396,382,34,86]], crown:[300,150,150,58]}
  };
  // Non-uniform mesh: dense 3px cells where facial handles live, 10px elsewhere.
  const MESH = {
    width:600, height:800,
    xBands:[[0,214,10],[214,388,3],[388,600,10]],
    yBands:[[0,246,10],[246,424,3],[424,800,10]]
  };
  const LIMITS = {gazePx:[3,1.8], lidMin:-.24, lidMax:1};
  /* Arm layers derived by brand/assistant/arms/derive.py: only arms and hands come from the
   * pose generations; matrix maps a piece's source pixels onto the canonical portrait. */
  const ARMS = {
    atlas:{file:'brand/assistant/arms.webp', width:374, height:457},
    pieces:{
      wipe:{atlas:[2,2,265,453], source:[30,201], matrix:[1.170282,0.030921,-38.78737,-0.030921,1.170282,-29.404078],
        bones:{shoulder:[215.65,514.29], elbow:[83.12,684.09], wrist:[206.46,388.05], hand:[275,234]}, grid:[18,30]},
      umbrella:{atlas:[269,2,103,252], source:[155,473], matrix:[1.08,0,-78,0,1.08,-7],
        bones:{elbow:[119.64,755.48], gripLow:[158.52,645.32], gripHigh:[150.96,509.24]}, grid:[8,20],
        // The shaft's lower end held in the fist appears only once the umbrella materialises.
        stub:[206,560,242,612]}
    },
    // Canonical right arm (viewer's left), hidden while the raised wipe arm replaces it.
    hideRight:[[22,560],[55,516],[105,503],[150,515],[168,556],[162,640],[172,720],[184,800],[16,800]],
    rightShoulder:[118,520]
  };
  // Holographic umbrella in image pixels: rib length, opening angles, panel count.
  const UMBRELLA = {ribLength:265, closedDeg:5, openDeg:68, ribs:10, holdTiltDeg:8, sag:.12};
  function solve(points) {
    // Quadratic through three points, expressed around the middle point.
    const [[xa,ya],[xm,ym],[xb,yb]] = points, da = xa-xm, db = xb-xm;
    const c2 = ((ya-ym)/da-(yb-ym)/db)/(da-db), c1 = (ya-ym)/da-c2*da;
    return [xm, ym, c1, c2];
  }
  function curves(eye) {
    return {open:solve(eye.open), closed:solve(eye.closed), lower:solve(eye.lower),
      top:solve(eye.top), bottom:solve(eye.bottom)};
  }
  function evaluate(curve, x) { const d = x-curve[0]; return curve[1]+curve[2]*d+curve[3]*d*d; }
  return deepFreeze({
    version:1,
    source:{image:'brand/assistant/idle.webp', closedLid:'brand/assistant/blink.webp', width:600, height:800},
    EYES, FEATURES, HEAD, BODY, MESH, LIMITS, ARMS, UMBRELLA, solve, curves, evaluate
  });
});
