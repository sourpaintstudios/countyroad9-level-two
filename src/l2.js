// L2 patch (v3): abduction clip -> Level Two in the ship (same gameplay, backdrop/skin swap) -> walk-out ending card.
import { A, play } from './audio.js';
const B = import.meta.env.BASE_URL + 'l2/';
export const L2 = { on: false };
const SND = ['L2_AMB_LabHum_Loop', 'L2_AMB_GlassTone', 'L2_VO_Whisper_01', 'L2_VO_Whisper_02', 'L2_VO_Whisper_03', 'L2_VO_Breath_Strained', 'L2_SFX_Strum_01'];
async function loadSnd() { if (!A.ctx) return; for (const n of SND) if (!A.buf[n]) { try { const r = await fetch(B + n + '.mp3'); A.buf[n] = await A.ctx.decodeAudioData(await r.arrayBuffer()); } catch (e) {} } }
function el(id, html) { let d = document.getElementById(id); if (!d) { d = document.createElement('div'); d.id = id; d.className = 'hidden'; d.innerHTML = html; document.body.appendChild(d); } return d; }
const watchers = '<i class="w w1"></i><i class="w w2"></i><i class="w w3"></i>';
export function initL2() {
  el('l2ship', `<div class="stars"></div><div class="hull"></div><div class="lamp l1"></div><div class="lamp l2"></div><div class="arm a1"></div><div class="arm a2"></div>${watchers}`);
  el('l2cut', `<video id="l2vid" playsinline preload="auto" src="${B}abduct.mp4"></video><button id="l2skip">SKIP ▸</button>`);
  el('l2end', `<div class="sky"></div><div class="glow"></div><div class="road"></div><svg class="walker" viewBox="0 0 60 100" fill="#000"><circle cx="24" cy="10" r="8"/><path d="M15 21q9-4 18 0l4 30-6 1-1-12v18l4 38h-7l-5-30-5 30h-7l3-38V40l-2 12-6-1z"/><path d="M30 44c-3-6 1-12 7-11l3-5 4 1-1 6c7 3 9 13 4 19-6 7-17 4-17-10z"/><circle cx="39" cy="45" r="2.5" fill="#3a2a20"/><path d="M40 33l14-28 4 2-14 28z"/><rect x="52" y="1" width="7" height="7" rx="1" transform="rotate(27 55 4)"/><path d="M33 26l9 13-3 2-9-12z"/></svg><h2>County Road 9. I'm home. …Am I home?</h2><p>Dawn. The grays ran. No souls, no song.</p><div class="esc">SCORE <b id="l2score">0</b></div><button id="l2again">PLAY AGAIN</button><button id="l2title" class="sm">TITLE</button>`);
}
let hum = null, wT = 0;
export function cutscene(done) {
  const c = document.getElementById('l2cut'), v = document.getElementById('l2vid'), sk = document.getElementById('l2skip'); c.classList.remove('hidden');
  let fin = false; const t0 = performance.now(); const end = () => { if (fin) return; fin = true; clearTimeout(to); v.pause(); c.classList.add('hidden'); c.onclick = null; done(); };
  v.onended = end; v.onerror = end; sk.onclick = (e) => { e.stopPropagation(); if (performance.now() - t0 > 700) end(); };
  try { v.currentTime = 0; } catch (e) {}
  const tapPlay = () => { sk.textContent = 'SKIP ▸'; c.onclick = () => { c.onclick = null; v.play().catch(end); }; };
  const p = v.play(); if (p) p.catch(() => { v.muted = true; v.play().catch(tapPlay); });
  const to = setTimeout(end, 21500);
}
export async function enterShip() {
  L2.on = true; document.body.classList.add('l2'); document.getElementById('l2ship').classList.remove('hidden');
  await loadSnd(); if (hum) hum.stop(0, 0.1); hum = play('L2_AMB_LabHum_Loop', { loop: true, gain: 0.5, bus: 'amb' });
  clearInterval(wT); wT = setInterval(() => { if (!L2.on) return; const n = ['L2_VO_Whisper_01', 'L2_VO_Whisper_02', 'L2_VO_Whisper_03', 'L2_AMB_GlassTone', 'L2_VO_Breath_Strained'][Math.floor(Math.random() * 5)]; play(n, { gain: 0.35, bus: 'amb', pan: Math.random() * 1.6 - 0.8 }); }, 6000);
}
export function fleeSfx() { if (L2.on) play('L2_SFX_Strum_01', { gain: 0.5 }); }
export function leaveShip() { L2.on = false; clearInterval(wT); if (hum) { hum.stop(0, 0.3); hum = null; } document.body.classList.remove('l2'); document.getElementById('l2ship').classList.add('hidden'); }
export function endCard(toTitle, score, again) { leaveShip(); const e = document.getElementById('l2end'); e.classList.remove('hidden'); document.getElementById('l2score').textContent = (score || 0).toLocaleString('en-US'); document.getElementById('l2again').onclick = (ev) => { ev.stopPropagation(); e.classList.add('hidden'); (again || toTitle)(); }; document.getElementById('l2title').onclick = (ev) => { ev.stopPropagation(); e.classList.add('hidden'); toTitle(); }; }
