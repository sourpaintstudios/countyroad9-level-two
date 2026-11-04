// DANA: 20+ simulated HONEST runs scored exactly like the game (first kill rounded to 0.01 s BEFORE scoring, sent as-is) must ALL pass checkRun.
import { checkRun, scoreOfV1 as scoreOf, round2 } from '../api/_lib.mjs'; // p4f: this is the OLD-build (v4.5) suite: it exercises the V1 rules, which stay valid for old versions
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const runs = []; let bad = 0, oldBad = 0;
for (let i = 0; i < 40; i++) {
  const abducted = i % 3 === 0, kills = Math.floor(rnd() * 9), fkRaw = kills ? 6.4 + rnd() * 20 + rnd() * 1e-3 : null;
  let bestStreak = 0, streakPts = 0, cur = 0; for (let k = 0; k < kills; k++) { if (rnd() < 0.6) { cur++; if (cur >= 2) streakPts += 250 * cur; } else cur = 1; bestStreak = Math.max(bestStreak, cur); }
  bestStreak = Math.min(bestStreak, kills);
  const S = { souls: kills, kills, bestStreak, streakPts, pointBlanks: Math.floor(rnd() * (kills + 1) * 0.4), firstKill: fkRaw == null ? null : round2(fkRaw) };
  const dur = +(abducted ? Math.max((fkRaw || 0) + 2.5 * kills + 1, 20 + rnd() * 70) : 58 + rnd() * 30).toFixed(1); const score = scoreOf(S);
  const run = { name: 'SIM ' + i, score, ...S, dur, abducted, v: '4.5' }; if (score < 1) continue;
  const e = checkRun(run); if (e) { bad++; console.log('REJECTED', e, JSON.stringify(run)); } runs.push(run);
  // the v4.5-pass-1 bug for reference: score from the RAW time, send it rounded
  const old = { ...run, firstKill: fkRaw == null ? null : +fkRaw.toFixed(2), score: S.souls * 1000 + kills * 500 + bestStreak * 300 + streakPts + S.pointBlanks * 750 + (fkRaw == null ? 0 : Math.max(0, Math.round((30 - fkRaw) * 50)) ) }; if (checkRun(old)) oldBad++;
}
const honest = runs.length; console.log(JSON.stringify({ honest, rejected: bad, abducted: runs.filter((r) => r.abducted).length, oldClientWouldReject: oldBad }));
// plausibility still bites
const fake = [{ ...runs[1], score: runs[1].score + 50 }, { ...runs[1], dur: 20 }, { ...runs[1], kills: 9, souls: 9 }, { ...runs[1], kills: 0, souls: 0, firstKill: null, score: 0 }, { ...runs.find((r) => r.kills === 8) || runs[1], dur: 31, abducted: true, firstKill: 25 }];
console.log('fakes rejected:', fake.map((f) => checkRun(f)));
process.exit(bad || honest < 20 ? 1 : 0);
