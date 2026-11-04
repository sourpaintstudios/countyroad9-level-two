// p4a atmosphere: moody night desert UNDER the paint layer. DOT budget: painted plates + cheap shaders, no 3D fog / light shafts / shadows / bloom.
// Draw calls added: desert band, dust+fireflies (1 Points), tumbleweed, jackrabbit, coyote eyes, ship ground spill, mile marker = 7.
import * as THREE from 'three';
import { G, VH, sprite } from './gfx.js';

// DOT/perf: fbm is BAKED into one 128x128 tileable texture (computed once at boot); shaders sample it instead of hashing per pixel
const NOISE = `uniform sampler2D tN; float fbm(vec2 p){ return texture2D(tN, p*.125).r; } float vn(vec2 p){ return texture2D(tN, p*.0625+.37).g; }`;
function noiseTex() { const N = 128, d = new Uint8Array(N * N * 4); const lat = (per, seed) => { const g = new Float32Array(per * per); let s = seed; for (let i = 0; i < g.length; i++) { s = (s * 16807) % 2147483647; g[i] = s / 2147483647; } return g; };
  const L = [[8, 0.55, lat(8, 11)], [16, 0.28, lat(16, 23)], [32, 0.17, lat(32, 37)]], sm = (t) => t * t * (3 - 2 * t);
  const val = (per, g, x, y) => { const fx = x * per / N, fy = y * per / N, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy), at = (a, b) => g[((b % per) * per) + (a % per)];
    return (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let v = 0; for (const [per, w, g] of L) v += val(per, g, x, y) * w; const i = (y * N + x) * 4; d[i] = v * 255; d[i + 1] = val(16, L[1][2], x, y) * 255; d[i + 2] = 0; d[i + 3] = 255; }
  const t = new THREE.DataTexture(d, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t; }
const VS = `varying vec2 vUv; varying vec2 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xy; gl_Position=projectionMatrix*viewMatrix*w; }`;

// shared state every system reads
export const AT = { wind: 0.3, gust: 0, gustT: 0, nextGust: 4, flash: 0, nextFlash: 9, dark: 0, green: 0, brk: 0, hush: 0, cloudX: 0, u: null };

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

export function buildAtmos(W, T, k, HZ) {
  const U = AT.u = { uT: { value: 0 }, uCloud: { value: 0 }, uFlash: { value: 0 }, uFlashX: { value: 0.3 }, uDark: { value: 0 }, uGreen: { value: 0 }, uBreak: { value: 0 },
    uGust: { value: 0 }, uBeamA: { value: new THREE.Vector2(0, -9999) }, uBeamB: { value: new THREE.Vector2(0, -9999) }, uBeamOn: { value: 0 }, uSpill: { value: new THREE.Vector3(0, -9999, 0) }, uHoles: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, -9999, 1, 0)) }, tN: { value: noiseTex() } };
  // ---- sky: plate + drifting cloud veil + Daniel's moon (SPS photo) with halo + painted god rays (baked texture, p4b) + dry lightning
  // p4b: moonbeams are a PAINTED texture (dry-brush strokes fanning down from the moon, baked once on a 256x256 canvas), not computed lighting
  const tRays = canvasTex(256, 256, (x, w, h) => { let sd = 5; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647); x.lineCap = 'round';
    for (let i = 0; i < 22; i++) { const ang = (r() - 0.5) * 1.5, len = 120 + r() * 140, bw = 6 + r() * 16, al = 0.05 + r() * 0.10;
      for (let k = 0; k < 6; k++) { const off = (k / 5 - 0.5) * bw; x.strokeStyle = `rgba(215,228,255,${al * (0.5 + r() * 0.6)})`; x.lineWidth = 1 + r() * 3; x.beginPath(); x.moveTo(w / 2 + off * 0.2, 0);
        x.lineTo(w / 2 + Math.sin(ang) * len + off, Math.cos(ang) * len); x.stroke(); } } });
  tRays.colorSpace = THREE.NoColorSpace;
  const sm = new THREE.ShaderMaterial({ transparent: false, depthTest: false, depthWrite: false, uniforms: { ...U, tSky: { value: T.sky }, tMoon: { value: T.moon }, tRays: { value: tRays }, uMoon: { value: new THREE.Vector2(0.68, 0.5) } },
    vertexShader: VS, fragmentShader: `${NOISE}
    uniform sampler2D tSky, tMoon, tRays; uniform vec2 uMoon; uniform float uT,uCloud,uFlash,uFlashX,uDark,uGreen,uBreak,uGust; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tSky, vUv).rgb; c = pow(c, vec3(1.08))*vec3(.86,.93,1.08); // push the plate to blue-black
      vec2 a = vec2(.75,1.), d = (vUv-uMoon)*a; float r = length(d), R = .046;
      // clouds: two fbm sheets drifting at different speeds; the near sheet crosses the moon
      vec2 q = vUv*vec2(3.,6.) + vec2(uCloud, 0.); float cl = smoothstep(.48,.78, fbm(q) ) * (1.-uBreak*.85);
      float cl2 = smoothstep(.5,.85, fbm(vUv*vec2(1.6,3.2)+vec2(uCloud*.45,9.)));
      float cov = clamp(cl*.85 + cl2*.4, 0., 1.);
      // moon disc
      vec2 mu = d/(2.*R)+.5; vec4 mt = (mu.x>0.&&mu.x<1.&&mu.y>0.&&mu.y<1.) ? texture2D(tMoon, mu) : vec4(0.);
      float moonVis = 1. - cov*.8;
      vec3 moonCol = vec3(.93,.95,1.);
      // halo + glow on cloud edges near the moon
      float halo = exp(-r*15.)*.55 + exp(-r*45.)*.5; 
      // painted god rays: soft angular bands falling away from the moon, broken by the clouds
      vec2 ru = vec2(.5 + d.x/1.1 + sin(uT*.07)*.01, 1. + d.y/.55); float rays = (ru.x>0.&&ru.x<1.&&ru.y>0.&&ru.y<1.) ? texture2D(tRays, ru).a*1.6 : 0.; // painted moonbeams (texture)
      rays *= (.35 + .9*cl2*(1.-cl)) * (.6 + uBreak*1.6);
      vec3 cloudLit = vec3(.32,.38,.52) * (.25 + 1.6*exp(-r*7.)) ;
      c = mix(c, cloudLit, cl*.55);
      c += moonCol*(halo*moonVis*(.6+uBreak*.5)) * vec3(.55,.65,.9);
      c += vec3(.5,.6,.85)*rays*.22;
      c = mix(c, moonCol*mt.rgb*1.15, mt.a*moonVis);
      // dry lightning: flickers inside the cloud bank low over the far mountains
      float fl = uFlash * exp(-abs(vUv.x-uFlashX)*6.) * smoothstep(.0,.18,vUv.y) * smoothstep(.5,.12,vUv.y);
      c += vec3(.55,.6,.9)*fl*(.4+cov);
      float lowH = smoothstep(.02,.16,vUv.y); c = mix(vec3(dot(c,vec3(.3,.59,.11)))*vec3(.6,.68,.85)*.7, c, lowH); // tame the plate's horizon glow (was a bright blue stripe)
      c *= 1. - uDark*.45;
      c = mix(c, c*vec3(.55,1.25,.6)+vec3(.0,.05,.0), uGreen*.75);
      gl_FragColor = vec4(c,1.); }` });
  W.sky.material = sm;
  // ---- far mountains: brightened by the lightning (plain material, color driven)
  // ---- mid desert band (NEW layer, between mountains and road)
  W.desert = sprite(T.desert, 1024 * k * 0.95, 160 * k * 0.95, { order: 0.9, parent: W.drive }); W.desert.position.y = HZ - 4 + 80 * k * 0.95 * 0.55;
  // ---- road: worn asphalt plate + heat shimmer at the horizon, cloud shadows, moon pool, headlights, ship spill, green pre-drop
  const gm = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, uniforms: { ...U, tGround: { value: T.ground } }, vertexShader: VS, fragmentShader: `${NOISE}
    uniform sampler2D tGround; uniform float uT,uCloud,uDark,uGreen,uBreak; uniform vec3 uSpill; varying vec2 vUv; varying vec2 vW;
    void main(){ float hz = 1.-42./560.; float nearH = smoothstep(hz-.12, hz, vUv.y);
      vec2 uv = vUv + vec2(sin(vUv.y*260.+uT*7.)*.0016*nearH, 0.); // heat shimmer just above the road surface at the horizon
      vec4 c = texture2D(tGround, uv); c.rgb *= vec3(.9,.95,1.05);
      // p4f MINNESOTA: the RIGHT shoulder (everything right of the asphalt edge) is a dark moonlit farm field with plough rows running to the vanishing point; the left shoulder stays desert
      { float vt = 1.-vUv.y, edge = (410. + (vt*560. - 50.)*1.88)/720.; float fr = smoothstep(edge-.012, edge+.012, vUv.x) * smoothstep(.43, .32, vt) * step(.075, vt);
        float a = (vUv.x - .569)/max(vt - .089, .01); float row = .5 + .5*sin(a*46.); float lum = dot(c.rgb, vec3(.3,.59,.11));
        vec3 fld = vec3(.05,.15,.11)*(.8 + .55*row) + lum*vec3(.12,.28,.2); c.rgb = mix(c.rgb, fld, fr*.88); }
      // perspective-ish coordinates for cloud shadows sweeping the road
      float z = 1./max(.02, hz - vUv.y + .02); vec2 gp = vec2((vUv.x-.5)*z*.6, z*.35 + uT*.0);
      float sh = smoothstep(.45,.7, fbm(gp*.6 + vec2(uCloud*1.4, 0.)));
      c.rgb *= 1. - sh*.42*(1.-uBreak);
      // moonlight pool on the asphalt (strong after a SHRED kill: clouds break, the road lights up)
      float pool = exp(-pow((vUv.x-.58)*3.,2.)) * smoothstep(hz-.5, hz-.1, vUv.y) * smoothstep(hz, hz-.1, vUv.y);
      c.rgb += vec3(.5,.6,.85)*pool*(.06 + uBreak*.32);
      // truck headlights wash the near road (warm), fading with distance
      float hl = smoothstep(.45,.0, vUv.y) * exp(-pow((vUv.x-.5)*2.4,2.));
      c.rgb += vec3(1.,.78,.5)*hl*.16;
      // ship light spilling onto the ground under the nearest saucer
      float sp = uSpill.z * exp(-pow((vW.x-uSpill.x)/260.,2.) - pow((vW.y-uSpill.y)/90.,2.));
      c.rgb += vec3(.55,1.,.7)*sp*.5;
      c.rgb *= 1. - uDark*.35;
      c.rgb = mix(c.rgb, c.rgb*vec3(.6,1.25,.65), uGreen*.7);
      gl_FragColor = c; }` });
  W.ground.material = gm;
  // ---- ground fog: painted sheets rolling sideways, torn open where the beam passes
  const fm = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.NormalBlending, uniforms: U, vertexShader: VS, fragmentShader: `${NOISE}
    uniform float uT,uCloud,uGust,uBeamOn,uDark,uGreen; uniform vec2 uBeamA,uBeamB; varying vec2 vUv; varying vec2 vW;
    uniform vec4 uHoles[4]; float holeK(vec2 p){ float k = 1.; for (int i = 0; i < 4; i++) { vec4 h = uHoles[i]; k = min(k, mix(1., smoothstep(h.z*.75, h.z*1.15, length(p-h.xy)), h.w)); } return k; }
    float segD(vec2 p, vec2 a, vec2 b){ vec2 ab=b-a; float t=clamp(dot(p-a,ab)/dot(ab,ab),0.,1.); return length(p-a-ab*t); }
    void main(){ float band = smoothstep(0.,.35,vUv.y)*smoothstep(1.,.45,vUv.y);
      float n = fbm(vec2(vUv.x*5. - uT*(.05+uGust*.12) - uCloud*.4, vUv.y*2.2 + sin(vUv.x*3.+uT*.2)*.3));
      float n2 = fbm(vec2(vUv.x*11. + uT*.08, vUv.y*5.));
      float a = band * smoothstep(.35,.75, n*.75+n2*.35) * .34;
      float bd = segD(vW, uBeamA, uBeamB); a *= 1. - uBeamOn*smoothstep(260.,40.,bd)*.85*(.6+.4*n2); // the beam blows the fog apart
      a *= holeK(vW); // p4b Chico: fog never covers a target ship or a falling cow
      vec3 col = mix(vec3(.3,.34,.44), vec3(.4,.6,.42), uGreen*.6) * (1.-uDark*.3);
      gl_FragColor = vec4(col, a); }` });
  W.fog.material = fm; W.fog.scale.set(1, 1, 1); W.fog.position.y = 40;
  // ---- dust specks (32, p4b: fewer, bigger) + fireflies/bugs (16): ONE Points draw call, lit by headlights and the beam
  const N = 48, pos = new Float32Array(N * 3), seed = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { seed.set([Math.random(), Math.random(), Math.random(), i < 32 ? 0 : 1], i * 4); }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const pm = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { ...U, uDrift: { value: 0 }, uPx: { value: 1 } },
    vertexShader: `attribute vec4 aSeed; uniform float uT,uDrift,uGust,uPx,uBeamOn; uniform vec2 uBeamA,uBeamB; varying float vA; varying float vF; varying vec3 vC;
    uniform vec4 uHoles[4]; float holeK(vec2 p){ float k = 1.; for (int i = 0; i < 4; i++) { vec4 h = uHoles[i]; k = min(k, mix(1., smoothstep(h.z*.75, h.z*1.15, length(p-h.xy)), h.w)); } return k; }
    float segD(vec2 p, vec2 a, vec2 b){ vec2 ab=b-a; float t=clamp(dot(p-a,ab)/dot(ab,ab),0.,1.); return length(p-a-ab*t); }
    void main(){ float W = ${(G.VW * 1.3).toFixed(1)}; bool fly = aSeed.w > .5;
      float x, y; if (!fly) { x = mod(aSeed.x*W + uDrift*(.6+aSeed.z), W) - W*.5; y = -760. + aSeed.y*760. + sin(uT*1.3+aSeed.z*30.)*18. + uGust*sin(x*.01+uT*3.)*25.; }
      else { x = (aSeed.x-.5)*W*.7 + sin(uT*.7+aSeed.z*40.)*60.; y = -500. + aSeed.y*420. + sin(uT*1.1+aSeed.x*20.)*40.; }
      vec2 p = vec2(x,y);
      float head = exp(-pow(x/260.,2.)) * smoothstep(-200., -700., y);
      float beam = uBeamOn * smoothstep(180., 20., segD(p, uBeamA, uBeamB));
      vF = fly ? 1. : 0.;
      vA = fly ? (.35+.65*pow(max(0., sin(uT*2.+aSeed.z*50.)),6.)) * (.4+head) : .07 + head*.5 + beam*.9;
      vA *= holeK(p); // p4b: no specks over a target ship / falling cow
      vC = fly ? vec3(.75,1.,.45) : mix(vec3(.75,.8,1.), vec3(1.,.85,.6), head);
      gl_PointSize = (fly ? 7. : 8. + aSeed.z*8.) * uPx * (1. + beam*.6);
      gl_Position = projectionMatrix*viewMatrix*vec4(p,0.,1.); }`,
    fragmentShader: `varying float vA; varying float vF; varying vec3 vC; void main(){ float d = length(gl_PointCoord-.5); float a = smoothstep(.5,.0,d); gl_FragColor = vec4(vC*a*vA, 1.); }` });
  W.dust = new THREE.Points(pg, pm); W.dust.renderOrder = 20; W.dust.frustumCulled = false; G.scene.add(W.dust); AT.dustU = pm.uniforms;
  // ---- small painted critters + props (canvas-painted, tiny textures)
  const tw = canvasTex(64, 64, (x) => { x.strokeStyle = 'rgba(150,130,100,.9)'; x.lineWidth = 1.4; for (let i = 0; i < 70; i++) { const a = Math.random() * 6.3, r = 8 + Math.random() * 22; x.beginPath(); x.moveTo(32 + Math.cos(a) * r * .3, 32 + Math.sin(a) * r * .3); x.quadraticCurveTo(32 + Math.cos(a + 1) * r, 32 + Math.sin(a + 1) * r, 32 + Math.cos(a + .3) * r, 32 + Math.sin(a + .3) * r); x.stroke(); } });
  W.tumble = sprite(tw, 1, 1, { order: 18, parent: W.drive }); W.tumble.visible = false; AT.tw = { on: false, t: 0 };
  const rb = canvasTex(64, 32, (x) => { x.fillStyle = '#1a1c24'; x.beginPath(); x.ellipse(30, 22, 16, 7, -0.1, 0, 7); x.fill(); x.beginPath(); x.ellipse(47, 15, 6, 5, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(49, 6, 2, 8, 0.25, 0, 7); x.fill(); x.beginPath(); x.ellipse(45, 6, 2, 8, -0.15, 0, 7); x.fill(); x.fillRect(12, 25, 18, 3); });
  W.rabbit = sprite(rb, 64, 32, { order: 2.5, parent: W.drive }); W.rabbit.visible = false; AT.rb = { t: 99, next: 18 };
  const ey = canvasTex(32, 8, (x) => { const g = (cx) => { const r = x.createRadialGradient(cx, 4, 0, cx, 4, 4); r.addColorStop(0, 'rgba(255,240,170,1)'); r.addColorStop(1, 'rgba(255,200,80,0)'); x.fillStyle = r; x.fillRect(cx - 4, 0, 8, 8); }; g(9); g(22); });
  W.eyes = sprite(ey, 26, 7, { add: true, order: 2.4, parent: W.drive }); W.eyes.visible = false; AT.ey = { t: 99, next: 12 };
  const sp = canvasTex(64, 64, (x) => { const r = x.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(160,255,190,.9)'); r.addColorStop(1, 'rgba(160,255,190,0)'); x.fillStyle = r; x.fillRect(0, 0, 64, 64); });
  W.spill = sprite(sp, 700, 200, { add: true, order: 2.6, parent: W.drive }); W.spill.material.opacity = 0;
  AT.mile = canvasTex(64, 160, (x) => { x.fillStyle = '#5d5a52'; x.fillRect(29, 50, 6, 110); x.fillStyle = '#1d5a3a'; x.fillRect(10, 6, 44, 52); x.strokeStyle = '#d8d8c8'; x.lineWidth = 2; x.strokeRect(13, 9, 38, 46); x.fillStyle = '#e8e6d8'; x.font = 'bold 13px sans-serif'; x.textAlign = 'center'; x.fillText('MILE', 32, 28); x.font = 'bold 20px sans-serif'; x.fillText('9', 32, 50); });
  // ---- sway: saguaros + brush bend with the gusts (vertex tweak, shared program)
  AT.sway = { value: 0 };
  return U;
}
export function swayMat(m, amt) { m.onBeforeCompile = (s) => { s.uniforms.uSway = AT.sway; s.uniforms.uSwayK = { value: amt };
  s.vertexShader = 'uniform float uSway; uniform float uSwayK;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float hh = clamp(uv.y,0.,1.); transformed.x += uSway*uSwayK*hh*hh;'); };
  m.customProgramCacheKey = () => 'sway' + amt; m.needsUpdate = true; }

// per-frame: ctx = { wave, preDive, beam:[x0,y0,x1,y1]|null, spill:[x,y,a]|null, steer, run }
export function updateAtmos(dt, T, W, ctx, proj) {
  const A = AT, U = A.u; if (!U) return;
  // wind: base rises per wave; gusts every 5-12 s (a gust sound plays at onset via onGust)
  const base = 0.22 + Math.min(4, ctx.wave || 0) * 0.1; A.nextGust -= dt;
  if (A.nextGust <= 0 && ctx.run) { A.gustT = 0.001; A.nextGust = 5 + Math.random() * 7 - Math.min(3, ctx.wave || 0); A.onGust && A.onGust(); }
  if (A.gustT > 0) { A.gustT += dt; const g = A.gustT; A.gust = g < 0.9 ? g / 0.9 : Math.max(0, 1 - (g - 0.9) / 2.2); if (g > 3.1) A.gustT = 0; } else A.gust = 0;
  A.wind = base + A.gust * (0.6 + 0.1 * (ctx.wave || 0));
  A.hush = Math.max(0, A.hush - dt); A.cloudX += dt * (0.012 + A.wind * 0.03);
  A.dark += ((Math.min(4, ctx.wave || 0) * 0.12) - A.dark) * Math.min(1, dt * 0.5);
  A.green = Math.max(0, A.green - dt * 0.9); A.brk = Math.max(0, A.brk - dt * 0.55);
  A.nextFlash -= dt; if (A.nextFlash <= 0) { A.nextFlash = 6 + Math.random() * 12; A.flT = 0; U.uFlashX.value = 0.15 + Math.random() * 0.7; }
  let fl = 0; if (A.flT != null) { A.flT += dt; const t = A.flT; fl = (t < 0.07 ? 1 : t < 0.12 ? 0.2 : t < 0.2 ? 0.8 : Math.max(0, 1 - (t - 0.2) / 0.35) * 0.6); if (t > 0.6) A.flT = null; }
  U.uT.value = T; U.uCloud.value = A.cloudX; U.uFlash.value = fl; U.uDark.value = A.dark; U.uGreen.value = Math.min(1, A.green); U.uBreak.value = Math.min(1, A.brk); U.uGust.value = A.gust;
  W.mesa.material.color.setScalar(0.8 - A.dark * 0.3 + fl * 0.5); W.desert.material.color.setScalar(0.85 - A.dark * 0.3 + fl * 0.15 + A.brk * 0.2);
  if (ctx.beam) { U.uBeamA.value.set(ctx.beam[0], ctx.beam[1] - W.drive.position.y); U.uBeamB.value.set(ctx.beam[2], ctx.beam[3] - W.drive.position.y); U.uBeamOn.value = Math.min(1, U.uBeamOn.value + dt * 4); } else U.uBeamOn.value = Math.max(0, U.uBeamOn.value - dt * 2);
  A.dustU.uDrift.value -= dt * (60 + A.wind * 520); A.dustU.uPx.value = G.renderer ? G.renderer.getPixelRatio() * (G.renderer.domElement.clientHeight || 900) / VH * 1.6 : 1;
  A.sway.value = Math.sin(T * 1.7) * 0.01 + A.gust * 0.05 * (0.7 + 0.3 * Math.sin(T * 6.3)) + A.wind * 0.012;
  // ship light spill
  if (ctx.spill) { W.spill.position.set(ctx.spill[0], ctx.spill[1], 0); W.spill.material.opacity += (ctx.spill[2] * 0.5 - W.spill.material.opacity) * Math.min(1, dt * 4); } else W.spill.material.opacity *= Math.max(0, 1 - dt * 3);
  // tumbleweed rolls across the road on gusts
  const tw = A.tw; if (!tw.on && A.gust > 0.5 && Math.random() < dt * 0.8) { tw.on = true; tw.z = 4 + Math.random() * 6; tw.X = -3; tw.dir = Math.random() < 0.5 ? 1 : -1; tw.X = -3 * tw.dir; tw.r = 0; }
  if (tw.on) { tw.X += tw.dir * dt * (0.9 + A.wind * 1.4); tw.z -= dt * 6 * 0.6; tw.r -= tw.dir * dt * 6; const [x, y] = proj(tw.X, tw.z); const s = 600 / tw.z * 0.38;
    W.tumble.visible = tw.z > 1 && Math.abs(tw.X) < 3.2; W.tumble.position.set(x, y + s * 0.5 + Math.abs(Math.sin(tw.r * 0.8)) * s * 0.3, 0); W.tumble.scale.setScalar(s); W.tumble.rotation.z = tw.r; if (tw.z < 1 || Math.abs(tw.X) > 3.3) { tw.on = false; W.tumble.visible = false; } }
  // jackrabbit dash across the mid desert
  const rb = A.rb; rb.next -= dt; if (rb.next <= 0 && ctx.run) { rb.next = 16 + Math.random() * 20; rb.t = 0; rb.dir = Math.random() < 0.5 ? 1 : -1; }
  if (rb.t < 1.4) { rb.t += dt; const u = rb.t / 1.4, hz = proj(0, 60)[1]; W.rabbit.visible = true; W.rabbit.position.set(rb.dir * (-700 + u * 1400), hz - 24 + Math.abs(Math.sin(u * 22)) * 10, 0); W.rabbit.scale.set(rb.dir * 0.7, 0.7, 1); } else W.rabbit.visible = false;
  // coyote eyes glinting in the brush, a blink or two, then gone
  const ey = A.ey; ey.next -= dt; if (ey.next <= 0 && ctx.run) { ey.next = 14 + Math.random() * 18; ey.t = 0; ey.x = (Math.random() < 0.5 ? -1 : 1) * (240 + Math.random() * 180); A.onEyes && A.onEyes(); }
  if (ey.t < 3) { ey.t += dt; const hz = proj(0, 30)[1]; W.eyes.visible = !(ey.t > 1.1 && ey.t < 1.25) && ey.t < 2.8; W.eyes.position.set(ey.x - ctx.steer * 20, hz - 30, 0); W.eyes.material.opacity = Math.min(1, ey.t * 3) * Math.min(1, (3 - ey.t) * 2); } else W.eyes.visible = false;
}
