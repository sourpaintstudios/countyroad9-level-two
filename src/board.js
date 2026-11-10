// v4.4 WITNESSES OF COUNTY ROAD 9 — the online board (IKE's diner sign-in sheet). DOT: fetched ONLY on the end card / title board, never during play.
import { cleanName, validName, isBad, NAME_MAX, scoreOf, round2, canPost, SCORE, multOf } from '../api/_lib.mjs';
export { scoreOf, round2, canPost, SCORE, multOf };
const SAUCER = '<svg class="ufo" viewBox="0 0 24 14" width="20" height="12" aria-label="abducted"><ellipse cx="12" cy="9" rx="11" ry="3.6" fill="#9aa"/><path d="M6 8a6 5 0 0 1 12 0z" fill="#7fd8ff"/><circle cx="6" cy="10" r="1" fill="#b6ff2e"/><circle cx="12" cy="11" r="1" fill="#b6ff2e"/><circle cx="18" cy="10" r="1" fill="#b6ff2e"/></svg>'; // pass 1: abducted runs get a little saucer
const API = `${import.meta.env.BASE_URL}api/scores`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export { cleanName, validName, isBad, NAME_MAX };
const STINK = `<svg class="stink" viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="30" rx="22" ry="26" fill="#a7acb5" stroke="#2a2a33" stroke-width="3"/>
<path d="M14 27 Q22 22 29 28 Q22 33 14 27Z" fill="#111"/><path d="M35 28 Q42 22 50 27 Q42 33 35 28Z" fill="#111"/>
<path d="M27 46 L37 46" stroke="#2a2a33" stroke-width="2" fill="none"/></svg>`;
export async function fetchBoard(timeoutMs = 6000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), timeoutMs);
  try { const r = await fetch(API, { signal: c.signal }); const j = await r.json(); return j && j.ok ? j : null; } catch (e) { return null; } finally { clearTimeout(t); }
}
export async function postScore(run, timeoutMs = 8000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), timeoutMs);
  try { const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(run), signal: c.signal }); const j = await r.json().catch(() => null); return j || { ok: false, error: `HTTP ${r.status}` }; }
  catch (e) { return { ok: false, error: 'offline' }; } finally { clearTimeout(t); }
}
// el: container. data: {top:[...]} or null (offline). rankFor: souls -> title. myId: highlight.
export function renderBoard(el, data, rankFor, myId, localBest) {
  const rows = (data && data.top) || [];
  let h = `<div class="sheet"><i class="pin"></i><div class="sheetHd">WITNESSES OF<br>COUNTY ROAD 9</div><div class="sheetSub">Sign in if you saw 'em.</div><ol class="wit">`;
  if (!data) h += `<li class="off">The sheet blew off the wall. (Board offline)<br><small>Your best on this phone: ${(localBest || 0).toLocaleString()} pts</small></li>`;
  else if (!rows.length) h += `<li class="off">Nobody's signed it yet. Be the first witness.</li>`;
  rows.forEach((e, i) => { h += `<li class="${e.id === myId ? 'me' : ''}"><b class="rk">${i + 1}.</b><span class="nm">${esc(e.name)}${e.abducted ? SAUCER : ''}</span><span class="sc">${e.score.toLocaleString()}</span><span class="tt">${esc(rankFor(e.souls))} · ${e.souls} soul${e.souls === 1 ? '' : 's'}</span>${e.ts ? `<span class="dt">abducted on this day · ${new Date(e.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>` : ''}${i === 0 ? '<em class="believe">The diner believes YOU.</em>' : ''}</li>`; });
  h += `<li class="gray">${STINK}<span class="nm">GRAY</span><span class="sc">0</span><span class="tt">0 souls · never was one</span></li></ol></div>`; // IKE: the fake GRAY always sits at the bottom (client-side only, never stored)
  el.innerHTML = h;
}
export function rivalLine(res, score) { // Chico: compare against the entry just below (beat) or just above (behind)
  if (!res || !res.ok) return '';
  const b = res.below, a = res.above;
  if (b) return `You beat ${esc(b.name)} by ${(score - b.score).toLocaleString()}!` + (a ? `<small>${(a.score - score).toLocaleString()} pts behind ${esc(a.name)}</small>` : '');
  if (a) return `${(a.score - score).toLocaleString()} pts behind ${esc(a.name)}`;
  return 'First witness on the sheet!';
}

// v4.9 name-entry board: the live sheet with a pending row (the player's name, typed live) sitting at the rank the score would earn. rows: current top list or null (offline)
export function entryRank(rows, score) { let r = 1; for (const e of rows || []) if (e.score >= score) r++; return r; }
export function renderEntryBoard(el, rows, score, souls, rankFor) {
  const rk = entryRank(rows, score); const list = rows ? rows.slice() : [];
  let h = `<div class="sheet compact"><i class="pin"></i><div class="sheetHd">WITNESSES OF COUNTY ROAD 9</div><ol class="wit" id="witList">`;
  list.forEach((e, i) => { if (i + 1 === rk) h += pendingRow(rk, score); h += `<li data-id="${esc(e.id)}"><b class="rk">${i + 1}.</b><span class="nm">${esc(e.name)}${e.abducted ? SAUCER : ''}</span><span class="sc">${e.score.toLocaleString()}</span></li>`; });
  if (rk > list.length) h += pendingRow(rk > 10 ? '—' : rk, score);
  h += `<li class="gray">${STINK}<span class="nm">GRAY</span><span class="sc">0</span></li></ol></div>`;
  el.innerHTML = h; return rk;
}
function pendingRow(rk, score) { return `<li class="me pend" id="pendRow"><b class="rk">${rk}.</b><span class="nm"><span id="pendName"></span><i class="cur"></i></span><span class="sc">${score.toLocaleString()}</span></li>`; }
export const rowHtml = (e, i) => `<li data-id="${esc(e.id)}"><b class="rk">${i + 1}.</b><span class="nm">${esc(e.name)}${e.abducted ? SAUCER : ''}</span><span class="sc">${e.score.toLocaleString()}</span></li>`;
