// CR9 v4.1 renderer: painted 2.5D layers on textured quads (Three.js, orthographic). No 3D models.
import * as THREE from 'three';
import MAN from './manifest.json';
export { THREE };
export const VH = 1600; // virtual world height; width follows the screen aspect
export const G = { renderer: null, scene: null, camera: null, VW: 720, tex: {}, shake: 0, zoom: 1, focus: new THREE.Vector2(0, 0) };

export function initRenderer(canvas, q) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'default' });
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * (q === 'low' ? 0.5 : 0.75);
  r.setPixelRatio(Math.max(1, dpr));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.setClearColor(0x05060d);
  G.renderer = r; G.scene = new THREE.Scene();
  G.camera = new THREE.OrthographicCamera(-360, 360, 800, -800, -10, 10); G.camera.position.z = 5;
  resize(); addEventListener('resize', resize);
  return r;
}
export function resize() {
  const w = innerWidth, h = innerHeight; G.renderer.setSize(w, h, false);
  G.VW = VH * w / h;
  const c = G.camera; c.left = -G.VW / 2; c.right = G.VW / 2; c.top = VH / 2; c.bottom = -VH / 2; c.updateProjectionMatrix();
}
// world <-> CSS px
export function toScreen(x, y) {
  const v = new THREE.Vector3(x, y, 0).project(G.camera);
  return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
}
export function toWorld(sx, sy) {
  const v = new THREE.Vector3(sx / innerWidth * 2 - 1, 1 - sy / innerHeight * 2, 0).unproject(G.camera);
  return [v.x, v.y];
}
export function updateCamera(dt) {
  const c = G.camera;
  c.zoom += (G.zoom - c.zoom) * Math.min(1, dt * 3.5);
  c.position.x += (G.focus.x - c.position.x) * Math.min(1, dt * 3.5);
  c.position.y += (G.focus.y - c.position.y) * Math.min(1, dt * 3.5);
  G.shake = Math.max(0, G.shake - dt * 2.2);
  const s = G.shake * G.shake * 40;
  c.position.x += (Math.random() - 0.5) * s; c.position.y += (Math.random() - 0.5) * s;
  c.updateProjectionMatrix();
}

const loader = new THREE.TextureLoader();
export function loadTextures(list, onProgress) {
  let done = 0;
  // v4.5.2: each texture retries up to 3 times (0.5 / 1 / 2 s backoff) before boot shows the tap-to-reload message
  const once = (u) => new Promise((res, rej) => loader.load(u, res, undefined, rej));
  const get = async (u) => { for (let i = 0; ; i++) { try { return await once(i ? `${u}?r=${i}` : u); } catch (e) { if (i >= 3) throw e; await new Promise((r) => setTimeout(r, 500 * 2 ** i)); } } };
  // p4b DOT: GPU-compressed ETC2 RGBA (1 B/px, tools/make_etc2.py) for the big sprite sheets when the GPU has it (Android WebGL2); else the webp
  const etc = !new URLSearchParams(location.search).get('noetc') && G.renderer && G.renderer.capabilities.isWebGL2 && G.renderer.extensions.has('WEBGL_compressed_texture_etc') && typeof DecompressionStream !== 'undefined'; G.etc2 = !!etc;
  const getEtc = async (file) => { if (!etc || !/\.webp$/.test(file)) return null; const n = MAN.art[file.replace(/\.webp$/, '.etc2.bin')]; if (!n) return null;
    try { const r = await fetch(`${import.meta.env.BASE_URL}art/${n}`); if (!r.ok) return null; let b = new Uint8Array(await r.arrayBuffer()); if (b[0] === 0x1f && b[1] === 0x8b) b = new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()); // gzipped on disk; some servers already inflate it in transit
      const h = new Uint32Array(b.buffer, 0, 4), W = h[1], H = h[2], w = h[3] & 0xffff, hh = h[3] >>> 16;
      const t = new THREE.CompressedTexture([{ data: b.subarray(16), width: W, height: H }], W, H, THREE.RGBA_ETC2_EAC_Format); t.flipY = false; t.needsUpdate = true; t.etc2 = true;
      t.image.srcW = w; t.image.srcH = hh; t.webp = `${import.meta.env.BASE_URL}art/${MAN.art[file]}`; return t; } catch (e) { console.warn('etc2 fallback', file, e); return null; } };
  return Promise.all(list.map(([key, file, opts = {}]) => new Promise((res, rej) => {
    getEtc(file).then((t) => t || get(`${import.meta.env.BASE_URL}art/${MAN.art[file]}`)).then((t) => {
      t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.anisotropy = 1;
      G.tex[key] = t; done++; onProgress && onProgress(done / list.length); res(t);
    }, rej);
  })));
}
export function subTex(t, rect, W, H) { // rect [x,y,w,h] in px, image W x H; shares GPU source
  const c = t.clone(); c.repeat.set(rect[2] / W, rect[3] / H); c.offset.set(rect[0] / W, 1 - (rect[1] + rect[3]) / H); c.needsUpdate = true; return c;
}
export function sprite(tex, w, h, o = {}) {
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, color: o.color ?? 0xffffff,
    blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: o.opacity ?? 1 });
  const g = new THREE.PlaneGeometry(w, h);
  if (o.anchor) g.translate(-(o.anchor[0] - 0.5) * w, -(o.anchor[1] - 0.5) * h, 0); // anchor in [0..1], (0.5,0) = bottom centre
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = o.order ?? 0; mesh.frustumCulled = false;
  if (o.parent !== null) (o.parent || G.scene).add(mesh);
  return mesh;
}
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw && draw(g, c);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.ctx2d = g; return t;
}

// ---------- shared GLSL ----------
const NOISE = /* glsl */`
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
// round-tipped paint drips hanging below ytop (no hard columns): capsule body + bulb tip
float drips(vec2 p, float N, float ytop, float amt, float seed){
  float cid=floor(p.x*N); float lx=(fract(p.x*N)-0.5)/N; float h1=hash(vec2(cid,seed)), h2=hash(vec2(cid,seed+1.7));
  float on=step(0.38,h1); float w=(0.14+0.2*h2)/N; float tip=ytop-amt*(0.25+0.75*h1);
  float taper=mix(1.0,0.7,smoothstep(ytop,tip,p.y));
  float body=smoothstep(w*taper, w*taper*0.6, abs(lx))*smoothstep(tip-0.002,tip+0.006,p.y)*step(p.y,ytop+0.03);
  float bulb=smoothstep(w*1.3, w*0.95, length(vec2(lx,(p.y-tip)*1.15)));
  return on*max(body,bulb)*step(0.002,amt);
}
vec3 paintPal(float t){ // Daniel's palette: purple, neon green, blue, magenta, orange
  t = fract(t);
  vec3 c0=vec3(0.42,0.12,0.75), c1=vec3(0.62,1.0,0.12), c2=vec3(0.15,0.45,1.0), c3=vec3(0.95,0.25,0.75), c4=vec3(1.0,0.55,0.1);
  float k = t*5.0; vec3 a = k<1.0?mix(c0,c1,k): k<2.0?mix(c1,c2,k-1.0): k<3.0?mix(c2,c3,k-2.0): k<4.0?mix(c3,c4,k-3.0): mix(c4,c0,k-4.0);
  return a; }
`;

// ---------- beam: ONE ribbon mesh, rebuilt along a curve each frame ----------
export function makeBeam() {
  const N = 40, pos = new Float32Array((N + 1) * 2 * 3), uv = new Float32Array((N + 1) * 2 * 2), idx = [];
  for (let i = 0; i <= N; i++) { uv.set([i / N, 0, i / N, 1], i * 4); if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uPow: { value: 1 }, uAlpha: { value: 1 }, uPulse: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: NOISE + `varying vec2 vUv; uniform float uT,uPow,uAlpha,uPulse;
      void main(){
        float v = vUv.y*2.0-1.0; float u = vUv.x;
        float wob = (fbm(vec2(u*6.0-uT*3.0, uT*0.7))-0.5)*0.5;
        float d = abs(v + wob*0.6);
        float edge = smoothstep(1.0, 0.55, d);
        float core = smoothstep(0.38, 0.0, d);
        // rainbow bands across the ribbon, swirling along it
        float h = vUv.y*0.9 + sin(u*10.0 - uT*7.0)*0.08 + fbm(vec2(u*3.0-uT*2.0, vUv.y*2.0))*0.3;
        vec3 rb = 0.55+0.45*cos(6.2831*(h+vec3(0.0,0.33,0.67)));
        float streak = smoothstep(0.55,1.0, fbm(vec2(u*14.0 - uT*12.0, vUv.y*5.0)));
        vec3 col = rb*(1.2+uPulse*1.5) + vec3(1.0)*core*(1.2+uPulse) + streak*vec3(0.7,1.0,0.3);
        float fade = smoothstep(0.0,0.06,u)*smoothstep(1.0,0.92,u);
        gl_FragColor = vec4(col*edge*fade*uAlpha*uPow, 1.0);
      }`,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 40; G.scene.add(mesh);
  const beam = { mesh, mat, N, pts: [], width: 70,
    // quadratic bezier from guitar (p0) curving to target (p2)
    set(p0, p1, p2, width, t) {
      this.width = width; this.pts.length = 0;
      for (let i = 0; i <= N; i++) {
        const s = i / N, a = (1 - s) * (1 - s), b = 2 * (1 - s) * s, c = s * s;
        const x = a * p0[0] + b * p1[0] + c * p2[0], y = a * p0[1] + b * p1[1] + c * p2[1];
        const dx = 2 * (1 - s) * (p1[0] - p0[0]) + 2 * s * (p2[0] - p1[0]), dy = 2 * (1 - s) * (p1[1] - p0[1]) + 2 * s * (p2[1] - p1[1]);
        const l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
        const w = width * (0.55 + 0.45 * Math.sin(Math.min(1, s * 1.3) * Math.PI * 0.5)) * (1 + 0.08 * Math.sin(s * 20 - t * 14));
        pos.set([x + nx * w, y + ny * w, 0, x - nx * w, y - ny * w, 0], i * 6); this.pts.push([x, y]);
      }
      g.attributes.position.needsUpdate = true;
    },
    at(s) { const f = s * N, i = Math.min(N - 1, Math.floor(f)), k = f - i, a = this.pts[i], b = this.pts[i + 1]; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; },
  };
  mesh.visible = false;
  return beam;
}

// ---------- ONE particle pool (<=500), ONE draw call; premultiplied so a particle can be additive (glow) or normal (paint) ----------
export const MAXP = 500;
export function makeParticles(atlas) {
  const pos = new Float32Array(MAXP * 3), col = new Float32Array(MAXP * 4), sz = new Float32Array(MAXP), cell = new Float32Array(MAXP), rot = new Float32Array(MAXP);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color4', new THREE.BufferAttribute(col, 4));
  g.setAttribute('size', new THREE.BufferAttribute(sz, 1)); g.setAttribute('cell', new THREE.BufferAttribute(cell, 1)); g.setAttribute('rot', new THREE.BufferAttribute(rot, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { tAtlas: { value: atlas }, uScale: { value: 1 } },
    vertexShader: `attribute vec4 color4; attribute float size, cell, rot; uniform float uScale; varying vec4 vC; varying float vCell, vRot;
      void main(){ vC=color4; vCell=cell; vRot=rot; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize=size*uScale; }`,
    fragmentShader: `uniform sampler2D tAtlas; varying vec4 vC; varying float vCell, vRot;
      void main(){ vec2 p=gl_PointCoord-0.5; float c=cos(vRot), s=sin(vRot); p=vec2(c*p.x-s*p.y, s*p.x+c*p.y)+0.5;
        if(p.x<0.0||p.y<0.0||p.x>1.0||p.y>1.0) discard;
        vec2 uv = (vec2(mod(vCell,4.0), floor(vCell/4.0)) + vec2(p.x, p.y))*0.25; uv.y = 1.0-uv.y;
        vec4 t = texture2D(tAtlas, uv); float a = t.a*clamp(vC.a,0.0,1.0);
        // vC.a in (0..1] = alpha; additive flag encoded by size sign is not available, so use cell>=0 and alpha>1 trick: see JS (mode)
        gl_FragColor = vec4(t.rgb*vC.rgb*a, a*step(0.5, fract(vC.a*0.5+0.25)*2.0 - 0.0) );
      }`,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 60; G.scene.add(pts);
  const P = { pts, mat, n: 0, count: 0, live: new Array(MAXP).fill(null), pool: [] };
  for (let i = 0; i < MAXP; i++) P.pool.push({ i, on: false });
  P.spawn = (o) => {
    let p = null; for (let k = 0; k < MAXP; k++) { const q = P.pool[(P.n + k) % MAXP]; if (!q.on) { p = q; P.n = (P.n + k + 1) % MAXP; break; } }
    if (!p) { p = P.pool[P.n]; P.n = (P.n + 1) % MAXP; } // steal oldest slot
    Object.assign(p, { on: true, x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 1, age: 0, s0: 40, s1: 40, cell: 0, r: 1, gg: 1, b: 1, a: 1, add: true, rot: 0, vr: 0, follow: null, fs: 0, fv: 0, onEnd: null }, o);
    return p;
  };
  P.update = (dt) => {
    let c = 0;
    for (const p of P.pool) {
      const i = p.i;
      if (!p.on) { sz[i] = 0; continue; }
      p.age += dt; if (p.age >= p.life) { p.on = false; sz[i] = 0; if (p.onEnd) p.onEnd(p); continue; }
      if (p.follow) { p.fs += p.fv * dt; if (p.fs >= 1) { p.on = false; sz[i] = 0; if (p.onEnd) p.onEnd(p); continue; } const q = p.follow.at(p.fs); p.x = q[0] + p.ox * (1 - p.fs); p.y = q[1] + p.oy * (1 - p.fs); }
      else { p.vy -= p.g * dt; const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; p.x += p.vx * dt; p.y += p.vy * dt; }
      p.rot += p.vr * dt; const t = p.age / p.life;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = 0;
      const fade = t < 0.1 ? t / 0.1 : 1 - Math.max(0, (t - 0.6) / 0.4);
      // a in (0,1]: normal-blend alpha; additive particles use a+? -> encoded as (alpha) with flag via +2 offset decoded in shader
      col[i * 4] = p.r; col[i * 4 + 1] = p.gg; col[i * 4 + 2] = p.b; col[i * 4 + 3] = p.a * fade * 0.999 + (p.add ? 0 : 0);
      addFlag[i] = p.add ? 1 : 0;
      sz[i] = p.s0 + (p.s1 - p.s0) * t; cell[i] = p.cell; rot[i] = p.rot; c++;
    }
    P.count = c;
    g.attributes.position.needsUpdate = g.attributes.color4.needsUpdate = g.attributes.size.needsUpdate = g.attributes.cell.needsUpdate = g.attributes.rot.needsUpdate = true;
    g.attributes.addf.needsUpdate = true;
  };
  P.clear = () => { for (const p of P.pool) p.on = false; };
  const addFlag = new Float32Array(MAXP); g.setAttribute('addf', new THREE.BufferAttribute(addFlag, 1));
  // simpler, explicit shader using the add flag attribute
  mat.vertexShader = `attribute vec4 color4; attribute float size, cell, rot, addf; uniform float uScale; varying vec4 vC; varying float vCell, vRot, vAdd;
      void main(){ vC=color4; vCell=cell; vRot=rot; vAdd=addf; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize=size*uScale; }`;
  mat.fragmentShader = `uniform sampler2D tAtlas; varying vec4 vC; varying float vCell, vRot, vAdd;
      void main(){ vec2 p=gl_PointCoord-0.5; float c=cos(vRot), s=sin(vRot); p=vec2(c*p.x-s*p.y, s*p.x+c*p.y)+0.5;
        if(p.x<0.0||p.y<0.0||p.x>1.0||p.y>1.0) discard;
        vec2 uv = (vec2(mod(vCell,4.0), floor(vCell/4.0)) + p)*0.25; uv.y = 1.0-uv.y;
        vec4 t = texture2D(tAtlas, uv); float a = t.a*vC.a;
        gl_FragColor = vec4(t.rgb*vC.rgb*a, a*(1.0-vAdd)); }`;
  return P;
}
export const CELL = { glow: 0, glob: 1, splat: 2, spark: 3, note: 4, confetti: 8, fire: 9, ring: 10, drip: 11 };

// ---------- alien face (p3b): Daniel's gray sheets in ONE 1920 atlas (p4b trimmed) (6x6 cells of 320 px, transparent bg), crossfade + melting twin + live paint + melt, ONE quad ----------
// cells 0-14 clean faces 1..15 | 15-29 the SAME faces melting | 30 clean master | 31 full dripping portrait | 32/33 hands-on-head video frames 11/21 (tools/make_gray_atlas.py)
export const PAINT_ON = new URLSearchParams(location.search).get('paint') !== '0'; // ?paint=0: A/B without the paint layer
export const GRAY_N = 6, GRAY_K = 320 / 1920;
export const GF = { happy: 0, sad: 1, angry: 2, surprised: 3, confused: 4, excited: 5, bored: 6, scared: 7, disgusted: 8, proud: 9, embarrassed: 10, determined: 11, curious: 12, laughing: 13, serious: 14, MELT: 15, master: 30, drip: 31, hands11: 32, lockSurp: 4, lockScared: 18 };
// p4b: white-eyed cells (3 surprised, 5 excited, 7 scared, 9 proud, 10 embarrassed, 12 curious + melt twins) are COMEDY-ONLY (shot / melt / panic gag / break-free).
// arrival, truck grab and lock-on use black-eyed cells only (14 serious, 0 happy, 6 bored, 4, 18, 32 = video frame 11). Frame 21 (glitch strip) is cut.
export const GF_COMEDY = [3, 5, 7, 9, 10, 12, 22, 27];
const CELL_GLSL = `vec2 cellUV(float c, vec2 p){ p = clamp(p, 0.002, 0.998); return vec2((mod(c, 6.0) + p.x)*${(320 / 1920).toFixed(6)}, 1.0 - (floor(c/6.0) + 1.0 - p.y)*${(320 / 1920).toFixed(6)}); }
      float twin(float c){ return c < 14.5 ? c + 15.0 : c; }`;
export function makeFaceMat(atlas, paintTex) {
  return new THREE.ShaderMaterial({
    uniforms: { tAtlas: { value: atlas }, tPaint: { value: paintTex }, uA: { value: 0 }, uB: { value: 0 }, uMix: { value: 0 }, uMelt: { value: 0 }, uT: { value: 0 }, uAlpha: { value: 1 }, uFlash: { value: 0 },
      uLook: { value: new THREE.Vector2() }, uLid: { value: 0 }, uLidOK: { value: 1 }, uGrin: { value: 0 }, uStrain: { value: 0 }, uBulge: { value: 0 }, uJaw: { value: 0 }, uEyeSlide: { value: 0 }, uWob: { value: 0 }, uDroop: { value: 0 },
      uTwin: { value: 0 }, uRing: { value: 0 }, uBeat: { value: 0 }, uBoil: { value: PAINT_ON ? 1 : 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: NOISE + `varying vec2 vUv; uniform sampler2D tAtlas, tPaint; uniform float uA,uB,uMix,uMelt,uT,uAlpha,uFlash,uStrain,uWob,uDroop,uTwin,uRing,uBeat,uBulge,uBoil;
      ${CELL_GLSL}
      vec4 face(float c, vec2 p){ vec4 a = texture2D(tAtlas, cellUV(c, p)), b = texture2D(tAtlas, cellUV(twin(c), p)); vec4 o = mix(a, b, uTwin); o.rgb = pow(max(o.rgb, 0.0), vec3(0.4545)); return o; } // sRGB art shown as painted (the texture is decoded to linear)
      void main(){
        // quad is 1 wide x 1.35 tall: the face cell on top, room for drips below. No badge, no ring: the gray's own silhouette is the shape.
        vec2 q = vec2(vUv.x, (vUv.y*1.35) - 0.35);
        q.x += uWob*0.022*sin(q.y*9.0 + uT*13.0); q.y += uWob*0.012*sin(q.x*8.0 - uT*11.0);
        q.y += uDroop*0.08*smoothstep(1.0, 0.25, q.y)*(0.55 + 0.45*fbm(vec2(q.x*3.0, 1.7)));
        // melt runs from the CROWN down (Daniel's clips): the top sags first, then columns drip off the chin
        float drip = uMelt * (0.25 + 0.75*fbm(vec2(q.x*7.0, 3.0))) * (0.5+0.5*fbm(vec2(q.x*2.5, uT*0.4)));
        float sag = uMelt*0.14*fbm(vec2(q.x*3.0, uT*0.6)) * smoothstep(0.35, 1.0, q.y);
        vec2 s = q; s.y += sag + drip*smoothstep(0.45, 0.0, q.y)*0.6;
        s.x += uMelt*0.02*sin(q.y*14.0+uT*3.0);
        vec2 ss = s; vec2 fs = ss + uStrain*0.004*vec2(sin(uT*61.0), cos(uT*53.0));
        fs += uBoil*0.004*(vec2(fbm(fs*5.0 + floor(uT*10.0)*1.7), fbm(fs*5.0 + 9.1 + floor(uT*10.0)*1.3)) - 0.5); // p3b: hand-painted boil, re-seeded at 10 fps
        fs = 0.5 + (fs - 0.5)/(1.0 + 0.06*uBulge); // eek: a quick scale pop (the art carries the expression)
        vec4 fa = face(uA, fs), fb = face(uB, fs);
        vec4 c = mix(fa, fb, uMix);
        float inCell = step(0.0, s.x)*step(s.x, 1.0)*step(0.0, s.y)*step(s.y, 1.0);
        float m = c.a*inCell*smoothstep(0.0, 0.2, s.y)*smoothstep(0.0, 0.05, s.x)*smoothstep(1.0, 0.95, s.x); // p3b: the bust fades out at the shoulders (no hard cell edge)
        vec3 rgb = c.rgb;
        // drips extend the silhouette below the chin while it melts (dark wet paint)
        float below = drips(q, 14.0, 0.06 + 0.06*smoothstep(0.4,0.0,abs(q.x-0.5)), uMelt*0.5, 3.0) * step(abs(q.x-0.5), 0.3) * step(q.y, 0.06);
        rgb = mix(rgb, vec3(0.16,0.17,0.2) + 0.25*paintPal(fbm(q*4.0+uT*0.3)), below*(1.0-m));
        m = max(m, below);
        vec4 pt = texture2D(tPaint, clamp(ss, 0.0, 1.0)); pt.a *= c.a;
        float gx = texture2D(tPaint, ss+vec2(0.006,0.0)).a - pt.a, gy = texture2D(tPaint, ss+vec2(0.0,0.006)).a - pt.a;
        float gloss = clamp(-(gx+gy)*6.0, 0.0, 1.0)*c.a;
        rgb = mix(rgb, pt.rgb, pt.a*0.85) + gloss*0.5;
        rgb = mix(rgb, paintPal(fbm(ss*3.0+uT*0.2)), uMelt*0.18*smoothstep(0.6,0.0,q.y+0.2));
        // Chico: sonic rings pulse out from the head on the song's beat while the beam holds (drawn in this quad, behind the gray)
        if (uRing > 0.001) { float r = length((q - vec2(0.5, 0.62))*vec2(1.0, 1.1)); float ph = fract(uBeat);
          float rings = 0.0; for (int k = 0; k < 3; k++) { float rr = 0.18 + (ph + float(k))/3.0*0.34; rings += smoothstep(0.012, 0.0, abs(r - rr))*(1.0 - (ph + float(k))/3.0); }
          rings *= uRing*smoothstep(0.52, 0.3, r); vec3 rc = vec3(0.35, 0.8, 1.0);
          rgb = mix(rc*rings*1.4, rgb, m); m = max(m, rings*0.85); }
        rgb += uFlash;
        gl_FragColor = vec4(rgb, m*uAlpha);
      }`,
    transparent: true, depthTest: false, depthWrite: false,
  });
}

// ---------- the MORPH: one quad, one draw call, 2.2 s, five stages synced to REX's FIGHT_Transform_Cow ----------
// Stage starts (s): 0 sag+drip | 0.40 collapse+swirl | 0.90 rise into cow shape (SDF blend) | 1.40 colour floods in | 1.70 shake off + sparkle | 2.20 done
export const MORPH_T = [0, 0.4, 0.9, 1.4, 1.7, 2.2];
export function makeMorphMat(atlas, cowFull, cowSdf, paintTex) {
  return new THREE.ShaderMaterial({
    uniforms: { tAtlas: { value: atlas }, tCow: { value: cowFull }, tSdf: { value: cowSdf }, tPaint: { value: paintTex }, uT: { value: 0 }, uTime: { value: 0 }, uCell: { value: 2 }, uAlpha: { value: 1 }, uCowR: { value: new THREE.Vector4(0, 0, 1, 1) }, uCowAsp: { value: 310 / 512 }, uBub: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: NOISE + `varying vec2 vUv; uniform sampler2D tAtlas,tCow,tSdf,tPaint; uniform float uT,uTime,uCell,uAlpha,uCowAsp,uBub; uniform vec4 uCowR; // v4.5: the cow is one frame of the cow SHEET (uCowR = uv rect)
      vec2 cowS(vec2 c){ return uCowR.xy + clamp(c,0.0,1.0)*uCowR.zw; }
      // quad layout (uv): face square at top (x .12-.88, y .5-1.0 * aspect), cow rect at bottom
      const float QA = 1.45;                 // quad height / width
      float ease(float x){ x=clamp(x,0.0,1.0); return x<0.5? 4.0*x*x*x : 1.0-pow(-2.0*x+2.0,3.0)/2.0; }
      float st(float a, float b){ return ease((uT-a)/(b-a)); }
      ${CELL_GLSL}
      void main(){
        vec2 P = vec2(vUv.x, vUv.y*QA);    // P.y in [0,QA]; x in [0,1]
        float s1=st(0.0,0.4), s2=st(0.4,0.9), s3=st(0.9,1.4), s4=st(1.4,1.7), s5=st(1.7,2.2);
        // ---- face (stages 1-2) ----
        vec2 fc = vec2(0.5, QA-0.38); float fr = 0.36;
        vec2 pc = vec2(0.5, 0.10);       // puddle centre (where the cow will stand)
        // flow-noise sag: content slides down, columns drip
        float col = floor(P.x*26.0);
        float dl = (0.3+0.7*hash(vec2(col,7.0)))*s1;
        vec2 fp = (P - fc)/(fr*2.0) + 0.5;
        float flow = fbm(vec2(P.x*4.0, P.y*2.0 - uTime*1.5));
        fp.y += s1*(0.10 + 0.25*flow)*(1.2-fp.y);   // sag
        fp.x += s1*0.04*sin(P.y*18.0+uTime*4.0);
        // collapse: face falls & squashes into the puddle while swirling
        vec2 cen = mix(fc, pc, s2);
        vec2 rad = mix(vec2(fr), vec2(0.42, 0.06), s2);
        vec2 dq = (P-cen)/rad; float ang = s2*5.0*(1.0-length(dq)*0.5);
        float ca=cos(ang), sa=sin(ang); vec2 dr = vec2(ca*dq.x - sa*dq.y, sa*dq.x + ca*dq.y);
        float faceD = length(dq) - 1.0 + (flow-0.5)*0.35*(s1+s2);
        // drip trails below the face during sag
        float trail = drips(P, 16.0, fc.y - fr*0.75, s1*(0.12+0.35*flow), 11.0) * step(abs(P.x-0.5), fr*0.85) * (1.0-s2);
        vec2 fuv = mix(fp, dr*0.5+0.5, s2);
        vec4 fcA = texture2D(tAtlas, cellUV(uCell, fuv)); vec3 faceC = pow(max(fcA.rgb, 0.0), vec3(0.4545));
        vec4 pt = texture2D(tPaint, clamp(fuv,0.0,1.0)); faceC = mix(faceC, pt.rgb, pt.a*0.9);
        // ---- paint swirl colour field ----
        vec2 sw = P - mix(pc, vec2(0.5,0.3), s3);
        float a2 = atan(sw.y, sw.x) + uTime*2.5 + length(sw)*6.0;
        vec3 swirl = paintPal(fbm(vec2(cos(a2), sin(a2))*1.5 + length(sw)*4.0 + uTime*0.4) + 0.15*sin(uTime));
        vec3 base = mix(faceC, swirl, smoothstep(0.0, 0.8, s2 + s1*0.25));
        // ---- cow shape (stage 3): SDF blend puddle -> cow ----
        vec2 cr0 = vec2(0.04, 0.0), cs = vec2(0.92, 0.92*uCowAsp);   // cow rect in P space
        vec2 cuv = (P - cr0)/cs;
        // shake-off wiggle in stage 5
        cuv.x += sin(uTime*45.0)*0.012*s5*(1.0-s5)*4.0;
        float cowD = (texture2D(tSdf, cowS(cuv)).r - 0.5)*255.0/2.0/512.0 * cs.x; // in P units
        if (cuv.x<0.0||cuv.x>1.0||cuv.y<0.0||cuv.y>1.0) cowD = 0.2;
        float swell = 1.0 + uBub*(0.22*s2*(1.0-s3) + 0.05*sin(uTime*13.0)*(1.0-s4)); // v4.5: the blob bubbles and swells before it forms
        float puddleD = length((P-pc)/(vec2(0.42,0.06*(1.0+s3*2.0)+uBub*0.12*s2*(1.0-s3))*swell))-1.0; puddleD *= 0.06;
        float wob = (fbm(P*6.0+uTime*(1.2+uBub*2.0))-0.5)*0.05*(1.0+uBub*1.5)*(1.0-s4);
        float shapeD = mix(puddleD, cowD, s3) + wob;
        // ---- assemble ----
        float faceMask = (uT<0.9) ? max(smoothstep(0.02,-0.02,faceD*rad.x)*mix(fcA.a, 1.0, s2), trail) : 0.0; // p3b: the gray's own silhouette (atlas alpha), no disc
        float cowMask = smoothstep(0.006, -0.006, shapeD) * step(0.0001, s2);
        // drips falling off the cow (stage 4-5)
        float dcol = floor(cuv.x*30.0); float dlx = fract(cuv.x*30.0)-0.5; float dlen = (0.04+0.08*hash(vec2(dcol,5.0)))*(1.0 - s5)*step(0.5,hash(vec2(dcol,9.0)))*step(0.01,s3)*max(0.0, 1.0-pow(abs(dlx)/0.34,2.0));
        float belly = texture2D(tSdf, cowS(vec2(cuv.x, cuv.y+0.05))).r;
        float dripM = (belly < 0.5 && cowD > 0.0 && cowD < dlen) ? 1.0 : 0.0;
        cowMask = max(cowMask, dripM*step(0.0,cuv.x)*step(cuv.x,1.0));
        vec4 cow = texture2D(tCow, cowS(cuv));
        // colour floods up from the bottom along a noise front
        float front = s4*1.35 - (cuv.y*0.9 + fbm(cuv*7.0)*0.45);
        float reveal = smoothstep(0.0, 0.08, front);
        float rim = smoothstep(0.0,0.05,front)*smoothstep(0.14,0.05,front);
        vec3 cowC = mix(swirl, cow.rgb, reveal*cow.a) + rim*vec3(0.6,1.0,0.25)*1.4;
        // glossy wet highlight on paint
        float hl = smoothstep(0.62, 0.9, fbm(P*9.0 + vec2(0.0,-uTime*0.8))) * (1.0-reveal) * 0.6;
        cowC += hl; base += hl*faceMask*0.6;
        float m = max(faceMask*(1.0-s3), cowMask);
        vec3 rgb = mix(base, cowC, cowMask);
        // sparkle as it gains a soul
        float spk = pow(max(0.0, sin(uTime*9.0+hash(floor(P*40.0))*30.0)), 30.0)*s5*cowMask*step(0.97, hash(floor(P*40.0)+1.0));
        rgb += spk*2.0;
        gl_FragColor = vec4(rgb, m*uAlpha);
      }`,
    transparent: true, depthTest: false, depthWrite: false,
  });
}

// ---------- glow line (v3.1 theremin duel): ONE ribbon mesh, per-vertex width/alpha/colour, rebuilt each frame ----------
export function makeLine(N, order = 55) {
  const pos = new Float32Array(N * 2 * 3), uv = new Float32Array(N * 2 * 2), col = new Float32Array(N * 2 * 4), idx = [];
  for (let i = 0; i < N; i++) { uv.set([i / (N - 1), 0, i / (N - 1), 1], i * 4); if (i < N - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aC', new THREE.BufferAttribute(col, 4)); g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: `attribute vec4 aC; varying vec2 vUv; varying vec4 vC; void main(){ vUv=uv; vC=aC; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; varying vec4 vC; uniform float uT;
      void main(){ float d = abs(vUv.y*2.0-1.0); float edge = pow(1.0 - d, 1.6); float core = smoothstep(0.22, 0.0, d);
        float shim = 0.9 + 0.1*sin(uT*6.0);
        vec3 c = mix(vC.rgb*shim, vec3(1.0), core*0.8); gl_FragColor = vec4(c*(edge*0.7 + core*0.6)*vC.a, 1.0); }`,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = order; mesh.visible = false; G.scene.add(mesh);
  // pts: arrays of [x, y, halfWidth, alpha, r, g, b] (world units), length N
  return { mesh, mat, N, set(pts) {
    for (let i = 0; i < N; i++) { const p = pts[i], w = p[2]; // vertical half-width = the pitch tolerance band (no spikes on note jumps)
      pos.set([p[0], p[1] + w, 0, p[0], p[1] - w, 0], i * 6); col.set([p[4], p[5], p[6], p[3], p[4], p[5], p[6], p[3]], i * 8); }
    g.attributes.position.needsUpdate = true; g.attributes.aC.needsUpdate = true; } };
}

// ---------- p3b PAINT LAYER (Sour Paint Studios): ONE full-screen overlay quad, ONE draw call, no post-process, no particles ----------
// paper grain + boiling edge bleed (re-seeded at 10 fps), drip edge along the top, event streaks (kills / melts / saved cows) running down in
// Daniel's red / blue / white, SHRED flood, abduction surgeon-wash (blue + yellow), intro painting running into place, dried-canvas DLR signature.
export const PAINT_MAXS = 10;
function paperTex() { // baked once: paper tooth, red/blue bleed along the edges, Daniel's drips hanging from the top (512x1024 canvas, ~2 MB GPU)
  const W = 512, H = 1024, c = document.createElement('canvas'); c.width = W / 2; c.height = H / 2; const g = c.getContext('2d'); g.scale(0.5, 0.5); /* p4b DOT: painted at 512x1024, stored at 256x512 (2 MB -> 0.5 MB GPU) */ let sd = 7; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9000; i++) { const v = 225 + r() * 30; g.fillStyle = `rgba(${v},${v - 4},${v - 12},${0.05 + r() * 0.07})`; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 3); }
  const pal = ['rgba(184,36,26,', 'rgba(26,62,184,', 'rgba(245,242,235,'];
  for (let i = 0; i < 150; i++) { const side = i % 4, t = r(), col = pal[(r() * 2) | 0], w = 8 + r() * 18, len = 40 + r() * 110, al = 0.10 + r() * 0.2; // p4a: edge bleed as dry-brush STROKES (bristle lines, tapered), not round bokeh blobs
    const x0 = side === 0 ? r() * w * 0.8 : side === 1 ? W - r() * w * 0.8 : t * W, y0 = side < 2 ? t * H : side === 2 ? r() * w * 0.8 : H - r() * w * 0.8, vert = side < 2, tilt = (r() - 0.5) * 0.25;
    const nb = 5 + ((r() * 6) | 0); g.lineCap = 'round';
    for (let k = 0; k < nb; k++) { const off = (k / (nb - 1) - 0.5) * w, bl = len * (0.55 + r() * 0.45), lw = 1 + r() * 2.6; g.strokeStyle = col + (al * (0.5 + r() * 0.7)) + ')'; g.lineWidth = lw; g.beginPath();
      let px = x0 + (vert ? off : 0), py = y0 + (vert ? 0 : off); g.moveTo(px, py); const steps = 8;
      for (let j = 1; j <= steps; j++) { const u = j / steps, d = bl * u, wob = Math.sin(u * 3 + k) * 1.5; if (r() < 0.12) { g.stroke(); g.beginPath(); } // dry-brush skips
        const nx = vert ? x0 + off + d * tilt + wob : x0 + d, ny = vert ? y0 + d : y0 + off + d * tilt + wob; g.lineTo(nx, ny); g.moveTo(nx, ny); }
      g.stroke(); } }
  for (let x = 0; x < W; x += 8 + r() * 14) { const col = pal[r() < 0.45 ? 0 : r() < 0.8 ? 1 : 2], len = 10 + r() * r() * 90, w = 3 + r() * 6; g.fillStyle = col + '0.8)'; g.fillRect(x, 0, w, len); g.beginPath(); g.arc(x + w / 2, len, w * 0.75, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; }
export function makePaintPass(painting) {
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  const sc = document.createElement('canvas'); sc.width = 128; sc.height = 256; const sx = sc.getContext('2d'); const sTex = new THREE.CanvasTexture(sc); sTex.colorSpace = THREE.NoColorSpace; sTex.minFilter = THREE.LinearFilter; sTex.generateMipmaps = false;
  const U = { tP: { value: painting }, tG: { value: paperTex() }, tS: { value: sTex }, uT: { value: 0 }, uBoil: { value: 0 }, uAsp: { value: 0.45 }, uFlood: { value: 0 }, uPal: { value: 0 }, uIntro: { value: 0 }, uIntroA: { value: 0 }, uDry: { value: 0 },
    uS: { value: Array.from({ length: PAINT_MAXS }, () => new THREE.Vector4(0, -99, 0, 0)) }, uSy: { value: new Array(PAINT_MAXS).fill(1) } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy*2.0, 0.0, 1.0); }`,
    fragmentShader: NOISE + `varying vec2 vUv; uniform sampler2D tP, tG, tS; uniform float uT,uBoil,uAsp,uFlood,uPal,uIntro,uIntroA,uDry; uniform vec4 uS[${PAINT_MAXS}]; uniform float uSy[${PAINT_MAXS}];
      vec3 pcol(float k){ return k < 0.5 ? vec3(0.78,0.13,0.08) : k < 1.5 ? vec3(0.10,0.24,0.72) : vec3(0.96,0.95,0.92); } // Daniel: red, blue, white
      float runCol(vec2 uv, float x, float w, float head, float seed){ // one vertical paint run: wobbling column, rounded drop at the head
        float wob = (vnoise(vec2(uv.y*4.0 + seed, uBoil*0.37)) - 0.5)*w*3.0; float taper = 0.55 + 0.45*smoothstep(head, head + 0.25, uv.y); float dx = abs(uv.x - x - wob)/(w*taper*(0.8 + 0.4*vnoise(vec2(uv.y*30.0, seed))));
        float body = smoothstep(1.0, 0.55, dx + 0.25*(vnoise(uv*vec2(60.0, 20.0) + seed) - 0.5))*step(head, uv.y); float drop = smoothstep(1.0, 0.75, length(vec2((uv.x - x - wob)/(w*1.5), (uv.y - head)/(w*1.5*uAsp))));
        return max(body, drop); }
      void main(){
        vec2 uv = vUv; float bo = uBoil*1.731; vec4 o = vec4(0.0);
        // paper grain + boiling edge bleed + the top drip edge: ONE baked canvas texture (~2 MB GPU), jittered at 10 fps so it boils
        vec2 jit = (vec2(hash(vec2(bo, 1.0)), hash(vec2(bo, 2.0))) - 0.5)*vec2(0.004, 0.002);
        o = texture2D(tG, uv + jit); o.a *= 1.0 + 0.8*uDry;
        // event streaks + SHRED flood: painted on the CPU into a tiny 128x256 canvas at 12 fps (one fetch here, no loops on the GPU)
        vec4 st = texture2D(tS, uv + jit*0.5); o = vec4(mix(o.rgb, st.rgb, st.a), max(o.a, st.a));
        // abduction: palette shifts to the surgeon washes (wet blue + yellow, bleeding)
        if (uPal > 0.001) { float w = vnoise(uv*vec2(2.5, 2.5/uAsp*0.5) + vec2(0.0, uT*0.03) + bo*0.02); vec3 wc = mix(vec3(0.12,0.36,0.85), vec3(0.98,0.82,0.22), smoothstep(0.42, 0.62, w));
          o = mix(o, vec4(wc, 0.42*uPal), uPal*0.85); }
        // dried canvas: Daniel's DLR signature, bottom-right (from his painting)
        if (uDry > 0.001) { vec2 sp = (uv - vec2(0.70, 0.015))/vec2(0.26, 0.26*uAsp*0.5); if (sp.x > 0.0 && sp.x < 1.0 && sp.y > 0.0 && sp.y < 1.0) { vec3 sc = texture2D(tP, vec2(0.80 + sp.x*0.13, 0.02 + sp.y*0.065)).rgb;
          float ink = smoothstep(0.55, 0.25, dot(sc, vec3(0.333))); o = mix(o, vec4(vec3(0.06), 0.9*uDry), ink*uDry); } }
        // intro: his County Road 9 painting runs into place (columns of paint fall from the top), then fades into the game
        if (uIntroA > 0.001) { vec2 pu = vec2(0.5 + (uv.x - 0.5)*uAsp*2.0*0.5/0.5*0.5, uv.y); pu.x = 0.5 + (uv.x - 0.5)*uAsp; // cover-fit a square painting on a tall screen
          float c3 = floor(uv.x*30.0); float front = 1.0 - uIntro*(1.25 + 0.5*hash(vec2(c3, 5.0))); float mm = smoothstep(front, front + 0.02, uv.y);
          vec3 pc = texture2D(tP, vec2(clamp(pu.x, 0.0, 1.0), uv.y)).rgb; o = mix(o, vec4(pc, 1.0), mm*uIntroA); }
        gl_FragColor = o;
      }` });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); q.frustumCulled = false; scene.add(q);
  const P = { scene, cam, mat, U, n: 0, sp: [], on: true };
  const PC = ['184,36,26', '30,66,190', '246,243,236']; // Daniel: red, blue, white
  P.runs = []; P.acc = 0; P.dirty = false;
  P.blobs = []; // p4f: windshield SPLATS (a thick blob + satellite flecks that grow for ~0.12 s, hold, then fade): the kill hit-feel; drawn into the same 128x256 canvas (no extra draw call)
  P.splat = (x, y, c, r = 0.06) => { if (P.blobs.length >= 6) P.blobs.shift(); P.blobs.push({ x, y, c, r, a: 0.92, age: 0, seed: Math.random() * 99 }); P.dirty = true; };
  P.streak = (x, y, c, w = 0.012) => { if (P.runs.length >= 24) P.runs.shift(); P.runs.push({ x, y0: y, head: y, w, c, v: 0.05 + Math.random() * 0.05, seed: Math.random() * 9, a: 0.85 }); P.dirty = true; };
  const draw = () => { sx.clearRect(0, 0, 128, 256); const fl = U.uFlood.value;
    if (fl > 0.01) { // p4b SHRED: stripes ONLY on the outer screen edges (x < 18% / > 82%) and up from the dashboard; the central sky stays clear so ships read
      const a = 0.7 * Math.min(1, fl * 3), drop = (1 - fl) * 256 * 0.6; // the whole stripe slides down + fades: gone in ~1 s
      for (let i = 0; i < 12; i++) { const side = i < 6 ? 0 : 1, k = i % 6, x = side ? 128 - 3 - k * 3.6 : 3 + k * 3.6, len = (0.35 + 0.45 * (((i * 104729) % 89) / 89)) * 256 * Math.min(1, fl * 2.5), w = 1.2 + (((i * 7919) % 97) / 97) * 1.6, y0 = drop;
        sx.fillStyle = `rgba(${PC[i % 3]},${a})`; sx.beginPath(); sx.moveTo(x - w, y0); for (let y = y0; y <= y0 + len; y += 16) sx.lineTo(x - w + Math.sin(y * 0.05 + i) * 1.2, y); sx.lineTo(x + w, y0 + len); sx.lineTo(x + w, y0); sx.fill(); sx.beginPath(); sx.arc(x, y0 + len, w * 1.2, 0, 7); sx.fill(); }
      for (let i = 0; i < 9; i++) { const x = 18 + i * 11.5, top = 256 - 46 * Math.min(1, fl * 2) + drop * 0.35, w = 2 + (i % 3); // dashboard band: short drips on the dash (bottom ~18%)
        sx.fillStyle = `rgba(${PC[(i + 1) % 3]},${a})`; sx.fillRect(x - w, top, w * 2, 256 - top); sx.beginPath(); sx.arc(x, top, w, 0, 7); sx.fill(); } }
    for (const r of P.runs) { const X = r.x * 128, Y0 = (1 - r.y0) * 256, Yh = (1 - r.head) * 256, W = Math.max(1.2, r.w * 128), bx = (y) => (r.bend || 0) * 128 * Math.pow(Math.max(0, y - Y0) / 256, 1.3) * 4; // p4a IKE: gusts bend the drips sideways
      sx.fillStyle = `rgba(${PC[r.c]},${r.a})`; sx.beginPath();
      sx.moveTo(X - W, Y0); for (let y = Y0; y <= Yh; y += 10) sx.lineTo(X - W * (0.7 + 0.3 * Math.sin(y * 0.11 + r.seed)) + Math.sin(y * 0.04 + r.seed) * 2 + bx(y), y);
      for (let y = Yh; y >= Y0; y -= 10) sx.lineTo(X + W * (0.7 + 0.3 * Math.sin(y * 0.13 + r.seed * 2)) + Math.sin(y * 0.04 + r.seed) * 2 + bx(y), y); sx.fill(); sx.beginPath(); sx.arc(X + Math.sin(Yh * 0.04 + r.seed) * 2 + bx(Yh), Yh, W * 1.25, 0, 7); sx.fill(); }
    for (const b of P.blobs) { const X = b.x * 128, Y = (1 - b.y) * 256, g = Math.min(1, b.age / 0.12), R = b.r * 128 * (0.55 + 0.45 * g); sx.fillStyle = `rgba(${PC[b.c]},${b.a})`; sx.beginPath(); sx.arc(X, Y, R, 0, 7); sx.fill();
      for (let i = 0; i < 7; i++) { const an = b.seed + i * 0.9, d = R * (1.15 + 0.55 * ((i * 37 + b.seed * 13) % 7) / 7) * g, rr = R * (0.16 + 0.12 * ((i * 11) % 5) / 5); sx.beginPath(); sx.arc(X + Math.cos(an) * d, Y + Math.sin(an) * d, rr, 0, 7); sx.fill(); } }
    sTex.needsUpdate = true; };
  P.update = (dt, T, asp) => { U.uT.value = T; U.uBoil.value = Math.floor(T * 10); U.uAsp.value = asp; // boil re-seeded at 10 fps
    for (const r of P.runs) { r.v += dt * 0.035; r.head -= r.v * dt; r.bend = (r.bend || 0) + ((P.wind || 0) * 0.06 - (r.bend || 0)) * Math.min(1, dt * 1.5); if (P.wind > 0.3) P.dirty = true; if (r.head < 0.15) r.a = Math.max(0, r.a - dt * 0.6); } P.runs = P.runs.filter((r) => r.head > -0.3 && r.a > 0.01); // runs slow, gather speed, slide off
    for (const b of P.blobs) { b.age += dt; if (b.age > 1.1) b.a -= dt * 0.55; } if (P.blobs.length) { P.blobs = P.blobs.filter((b) => b.a > 0.02); P.dirty = true; }
    const was = U.uFlood.value; U.uFlood.value = Math.max(0, was - dt * 1.0); // p4b: SHRED stripes drip away within ~1 s
    P.acc += dt; if (P.acc >= 1 / 12 && (P.runs.length || was > 0 || P.dirty)) { P.acc = 0; P.dirty = P.runs.length > 0 || U.uFlood.value > 0; draw(); } }; // 12 fps redraw, only while something runs
  return P;
}
