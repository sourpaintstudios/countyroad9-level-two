// DANA pass 3 + p4f: 500,000 simulated HONEST runs built from the game's own rules (src/main.js kill()/beamUp()/cowShot()/scoring), every one must pass checkRun.
// Deliberately generous to the player: any point-blank rate (0-100 % per player), any chaining habit, any cow-shooting habit, first kills right down to the mechanical floor
// (ship 1 at 1.4 s of fight time + 3 s of wave-1 beam (p4e), minus up to one capped 0.1 s frame), abducted and completed runs, HYPER-speed double kills.
// p4f: (1) 500k runs under the NEW rules (v 4.6.0), (2) 100k runs under the OLD rules (v 4.5.2) which must still pass checkRun (old tabs + scores already on the board), (3) fakes for both.
import { checkRun, checkRunV1, scoreOf, scoreOfV1, round2, maxScore, maxScoreV1, FK_MIN, SCORE, isV2 } from '../api/_lib.mjs';
let seed = 12345; const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
const N = +(process.argv[2] || 500000), N1 = Math.round(N / 5); let bad = 0, posted = 0, fkLow = 1e9, top = 0, cowHitsSeen = 0, maxMult = 0, chains5 = 0; const why = {};
function sim(v2) {
  const kills = 1 + Math.floor(rnd() * 8), abducted = rnd() < 0.35, pbRate = rnd() < 0.05 ? 1 : rnd(), chain = rnd() < 0.05 ? 1 : rnd(), cowRate = rnd() < 0.3 ? 0 : rnd() < 0.1 ? 1 : rnd() * 0.5;
  // first kill: fight-time floor 4.7 s (p4e: measured 4.73 s with a 3 s wave-1 beam), plus a player-dependent delay (often 0 for an expert); the wall clock may trail by up to one capped frame
  const fightT = 4.7 + (rnd() < 0.1 ? 0 : -Math.log(1 - rnd()) * 6), fkWall = fightT - rnd() * 0.1 + (rnd() < 0.5 ? 0 : rnd() * 0.002);
  let streak = 0, bestStreak = 0, streakPts = 0, pointBlanks = 0, cowPts = 0, cowHits = 0, t = fkWall;
  for (let k = 0; k < kills; k++) {
    if (k > 0) { if (rnd() > chain) streak = 0; t += rnd() < 0.15 ? 0.033 : 2.5 + rnd() * 9; } // let go (beamUp: streak = 0) or keep holding; HYPER double kills ~33 ms apart
    streak = streak + 1; bestStreak = Math.max(bestStreak, streak); if (streak >= 2) streakPts += 250 * streak; // V1 streak points
    const m = Math.min(streak, SCORE.MULT_CAP); cowPts += SCORE.SAVE * m; maxMult = Math.max(maxMult, m); if (streak >= 5) chains5++; // V2: the saved cow pays 1500 x the streak at the kill, capped 5x
    if (rnd() < pbRate) pointBlanks++;
    if (v2 && rnd() < cowRate) { cowHits++; cowHitsSeen++; streak = 0; } // V2: the saved cow is shot by mistake: -1000 and the streak breaks (once per cow)
  }
  const S = v2 ? { souls: kills, kills, bestStreak, cowPts, cowHits, pointBlanks, firstKill: round2(fkWall) } : { souls: kills, kills, bestStreak, streakPts, pointBlanks, firstKill: round2(fkWall) };
  const tail = abducted ? 1 + rnd() * 30 : 8 + rnd() * 20; const dur = +Math.min(900, Math.max(t + tail, S.firstKill + 2.5 * (kills - 1) + 0.2)).toFixed(1);
  return { name: 'SIM', score: v2 ? scoreOf(S) : scoreOfV1(S), ...S, dur, abducted, v: v2 ? '4.6.0' : '4.5.2' };
}
function runBatch(n, v2) { let b = 0; for (let i = 0; i < n; i++) { const run = sim(v2); posted++; fkLow = Math.min(fkLow, run.firstKill); top = Math.max(top, v2 ? run.score : 0);
  const e = checkRun(run); if (e) { b++; bad++; why[(v2 ? 'V2 ' : 'V1 ') + e] = (why[(v2 ? 'V2 ' : 'V1 ') + e] || 0) + 1; if (bad <= 5) console.log('REJECTED', e, JSON.stringify(run)); } } return b; }
const bad2 = runBatch(N, true), bad1 = runBatch(N1, false);
// ---- fakes ----
const base2 = { name: 'FAKE', souls: 8, kills: 8, dur: 60, abducted: false, v: '4.6.0', cowHits: 0 };
const mk2 = (o) => { const r = { ...base2, ...o }; r.score = o.score ?? scoreOf(r); return r; };
const honest8 = { bestStreak: 8, cowPts: 45000, pointBlanks: 8, firstKill: 9 };
const fakes2 = {
  'V2 fk 3.0 (impossible first kill)': mk2({ ...honest8, firstKill: 3 }),
  'V2 fk 4.3 (below floor: <4.3 must fail, 4.3 itself is the floor so test 4.29)': mk2({ ...honest8, firstKill: 4.29 }),
  'V2 saved-cow points too big for best streak 3': mk2({ bestStreak: 3, cowPts: 45000, pointBlanks: 4, firstKill: 9 }),
  'V2 best streak 6 but no streak bonus (cowPts 12000 = eight 1x kills)': mk2({ bestStreak: 6, cowPts: 12000, pointBlanks: 2, firstKill: 9 }),
  'V2 multiplier above the 5x cap (8-chain paid uncapped 36x)': mk2({ bestStreak: 8, cowPts: 54000, pointBlanks: 0, firstKill: 9 }),
  'V2 score off by 250': mk2({ bestStreak: 2, cowPts: 12000 + 1500 * 2, pointBlanks: 1, firstKill: 9, score: scoreOf({ kills: 8, cowPts: 15000, cowHits: 0, pointBlanks: 1, firstKill: 9 }) + 250 }),
  'V2 score off by 1 point': mk2({ ...honest8, score: scoreOf({ kills: 8, cowPts: 45000, cowHits: 0, pointBlanks: 8, firstKill: 9 }) + 1 }),
  'V2 cowPts not a multiple of 1500': mk2({ bestStreak: 2, cowPts: 13250, pointBlanks: 0, firstKill: 9 }),
  'V2 more cows shot than kills (score inflated by negative-looking claim)': mk2({ ...honest8, cowHits: 9 }),
  'V2 hides cow shots (cowHits -1 = +1000)': mk2({ ...honest8, cowHits: -1 }),
  'V2 point blanks > kills': mk2({ ...honest8, pointBlanks: 9 }),
  'V2 8 kills in 20 s (too fast)': mk2({ ...honest8, dur: 20 }),
  'V2 the old-format run (streakPts, no cowPts) on the new version': { name: 'FAKE', souls: 8, kills: 8, dur: 60, abducted: false, v: '4.6.0', bestStreak: 8, streakPts: 8750, pointBlanks: 8, firstKill: 9, score: 30000 },
  'V2 run claims the OLD version to dodge the new rules (extra fields, V1 formula)': { ...mk2({ ...honest8 }), v: '4.5.2' },
};
const base1 = { name: 'FAKE', souls: 8, kills: 8, dur: 60, abducted: false, v: '4.5.2' };
const mk1 = (o) => { const r = { ...base1, ...o }; r.score = o.score ?? scoreOfV1(r); return r; };
const fakes1 = {
  'V1 fk 3.0 (impossible)': mk1({ bestStreak: 8, streakPts: 8750, pointBlanks: 8, firstKill: 3 }),
  'V1 fk 4.29 (below floor)': mk1({ bestStreak: 8, streakPts: 8750, pointBlanks: 8, firstKill: 4.29 }),
  'V1 streak pts too big for best streak 3': mk1({ bestStreak: 3, streakPts: 8750, pointBlanks: 4, firstKill: 9 }),
  'V1 best streak 6 but no streak pts': mk1({ bestStreak: 6, streakPts: 0, pointBlanks: 2, firstKill: 9 }),
  'V1 score off by 250': mk1({ bestStreak: 2, streakPts: 500, pointBlanks: 1, firstKill: 9, score: scoreOfV1({ souls: 8, kills: 8, bestStreak: 2, streakPts: 500, pointBlanks: 1, firstKill: 9 }) + 250 }),
  'V1 a new-formula score sent with the old version': { ...base1, bestStreak: 8, streakPts: 8750, pointBlanks: 8, firstKill: 9, score: 56000 },
};
const fr = Object.fromEntries(Object.entries({ ...fakes2, ...fakes1 }).map(([k, f]) => [k, checkRun(f) || 'ACCEPTED']));
// the v1 checker alone still agrees with the dispatcher for old versions, and legacy runs without a v stay on V1
const legacyNoV = (() => { const r = sim(false); delete r.v; return checkRun(r) === null && checkRunV1(r) === null; })();
// boundary sanity: the exact fastest honest first kill (4.3) and the best possible 8-chain are accepted
const edge = [mk2({ ...honest8, firstKill: 4.3 }), mk2({ bestStreak: 1, cowPts: 12000, pointBlanks: 0, firstKill: 9, cowHits: 8 })].map((r) => checkRun(r) || 'OK');
console.log(JSON.stringify({ honestV2: N, rejectedV2: bad2, honestV1_oldBuilds: N1, rejectedV1: bad1, reasons: why, cowHitsSimulated: cowHitsSeen, chainsAtOrOverX5: chains5, maxMultSeen: maxMult, lowestFirstKill: fkLow, highestHonestScoreV2: top, maxScoreV2_8kills: maxScore(8), maxScoreV1_8kills: maxScoreV1(8), FK_MIN, SCORE, legacyNoVersionStillV1: legacyNoV, edgeCasesAccepted: edge, fakes: fr }, null, 1));
const fakeFail = Object.values(fr).includes('ACCEPTED') || edge.some((e) => e !== 'OK') || !legacyNoV;
process.exit(bad || fakeFail ? 1 : 0);
