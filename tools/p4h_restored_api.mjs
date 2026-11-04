// p4h (v4.8.0): a run that says restored:true is accepted by the SAME rules (nothing loosened); a non-boolean restored is rejected; FK_MIN etc. still bite
import { checkRun, scoreOf, scoreOfV1, round2 } from '../api/_lib.mjs';
const S = { kills: 3, souls: 3, bestStreak: 2, cowPts: 1500 + 3000 + 1500, cowHits: 0, pointBlanks: 1, firstKill: round2(9.37) }; // chain: kill 1 alone (1x), kills 2-3 chained (2x, 3x)? checked below by the server itself
const base = { name: 'SIM', ...S, abducted: false, dur: 60, v: '4.8.0' };
let ok = true; const t = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) ok = false; };
// find a score the server accepts for this body by the game's own formula
const body = (o = {}) => { const r = { ...base, ...o }; r.score = scoreOf(r); return r; };
const plain = checkRun(body());
console.log('plain verdict:', plain || 'OK');
if (plain) { // fall back to a combination the combinatorics accept: 3 kills, best streak 3 -> cowPts 1500*(1+2+3)
  Object.assign(base, { bestStreak: 3, cowPts: 9000 }); console.log('plain verdict (chain of 3):', checkRun(body()) || 'OK'); }
const p0 = checkRun(body());
t('plain run accepted', !p0);
t('same run with restored:true accepted', !checkRun(body({ restored: true })));
t('same run with restored:false accepted', !checkRun(body({ restored: false })));
t('restored:"yes" rejected (type check)', checkRun(body({ restored: 'yes' })) === 'bad body');
t('restored:1 rejected (type check)', checkRun(body({ restored: 1 })) === 'bad body');
t('restored:true does not loosen FK_MIN (first kill 4.0 still rejected)', !!checkRun(body({ restored: true, firstKill: 4.0 })));
t('restored:true does not loosen score check (+1 point rejected)', !!checkRun({ ...body({ restored: true }), score: body().score + 1 }));
t('restored:true does not loosen timing (dur 12 s with 3 kills rejected)', !!checkRun(body({ restored: true, dur: 12 })));
t('restored:true does not loosen max duration (1000 s rejected)', !!checkRun(body({ restored: true, dur: 1000 })));
t('restored:true does not loosen kills <= 8 (9 kills rejected)', !!checkRun(body({ restored: true, kills: 9, souls: 9 })));
{ const o = { name: 'OLD', souls: 1, kills: 1, bestStreak: 1, streakPts: 0, pointBlanks: 0, firstKill: 10, abducted: true, dur: 40, v: '4.5' }; o.score = scoreOfV1(o);
  t('old build (4.5) honest run accepted by the V1 rules', !checkRun(o)); t('old build (4.5) + restored:true judged by the V1 rules (accepted)', !checkRun({ ...o, restored: true })); t('old build (4.5) + restored:"x" rejected', checkRun({ ...o, restored: 'x' }) === 'bad body'); t('old build (4.5) wrong score still rejected', !!checkRun({ ...o, score: o.score + 250 })); }
process.exit(ok ? 0 : 1);
