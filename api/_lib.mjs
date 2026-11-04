// CR9 leaderboard rules, shared by the game (src/board.js) and the Vercel Function (api/scores.mjs). Files starting with _ are not deployed as functions.
export const NAME_MAX = 10, TOTAL = 8, MAX_DUR = 900; // pass 1 (Chico): ANY run with >= 1 kill may post (completed or abducted); timing plausibility scales with the run length
export const canPost = (r) => !!r && Number.isInteger(r.kills) && r.kills >= 1; // ONE rule, used by the game (name entry) and the server
// word filter: checked on the name with spaces removed and common digit swaps undone (0->O 1->I 3->E 4->A 5->S 7->T 8->B)
const SUB = ['FUCK', 'FUK', 'FCK', 'SHIT', 'CUNT', 'COCK', 'DICK', 'PUSSY', 'BITCH', 'NIGG', 'NIGA', 'FAGG', 'SLUT', 'WHORE', 'TWAT', 'RAPE', 'NAZI', 'HITLER', 'PENIS', 'VAGINA', 'PORN', 'BOOB', 'TITS', 'DILDO', 'JIZZ', 'WANK', 'BLOWJ', 'ANAL', 'CUMSHOT', 'KIKE', 'SPIC', 'CHINK', 'RETARD', 'MOLEST', 'PEDO', 'ASSHOLE', 'BASTARD', 'DAMN'];
const WORD = ['ASS', 'CUM', 'SEX', 'FAG', 'KKK', 'TIT', 'GAY', 'HOE', 'JEW', 'NIG', 'POO', 'PEE', 'WTF', 'STFU', 'ISIS', 'XXX', '666'];
export function cleanName(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/ +/g, ' ').slice(0, NAME_MAX); }
export function isBad(name) {
  const n = cleanName(name).trim(), flat = n.replace(/ /g, '').replace(/[013457 8]/g, (d) => ({ 0: 'O', 1: 'I', 3: 'E', 4: 'A', 5: 'S', 7: 'T', 8: 'B' })[d] || d);
  if (SUB.some((w) => flat.includes(w))) return true;
  return n.split(' ').concat([flat]).some((w) => WORD.includes(w.replace(/[013457 8]/g, (d) => ({ 0: 'O', 1: 'I', 3: 'E', 4: 'A', 5: 'S', 7: 'T', 8: 'B' })[d] || d)));
}
export function validName(name) { const n = cleanName(name).trim(); return n.length >= 1 && n.length <= NAME_MAX && /^[A-Z0-9 ]+$/.test(n) && !isBad(n); }
// score = souls*1000 + kills*500 + bestStreak*300 + streakPts + pointBlanks*750 + first-kill bonus (game: kill() / parade)
export const round2 = (x) => Math.round(x * 100) / 100; // DANA: the first-kill time is rounded to 0.01 s BEFORE scoring, on both sides
export const fkBonus = (fk) => (fk == null ? 0 : Math.max(0, Math.round((30 - round2(fk)) * 50)));
export const scoreOfV1 = (r) => r.souls * 1000 + r.kills * 500 + r.bestStreak * 300 + r.streakPts + r.pointBlanks * 750 + fkBonus(r.firstKill); // ONE formula: the game scores with this too
// pass 3 (DANA): bounds that REAL play always satisfies, derived from the game's own rules (src/main.js), not from tuning:
// * first kill: ship 1 spawns at FIRST_WAVE_AT = 1.4 s of fight time and (p4e Chico) a wave-1 gray needs lockSec(0) = 3 s of beam (no HYPER yet: SHRED starts at 0),
//   fight time never runs ahead of the wall clock (dt is capped at 0.1 s; slow-mo only slows it). Mechanical floor 4.4 s minus one capped frame = 4.3 s.
//   p4e DANA: MEASURED fastest honest first kill (tools/p4e_fastkill.py, expert thumb on the pad from t=0, 6 runs): 4.73 s (ship 1 is lockable from ~1.74 s).
//   FK_MIN = 4.3 s, the mechanical floor above (game timing cannot produce a faster first kill); measured fastest honest kill 4.73 s.
// * streak points: each kill with streak s >= 2 pays exactly 250*s, so a streak of length s pays T(s) = 250*(s(s+1)/2 - 1). With k kills and a best
//   streak b, streakPts is at least T(b) (the best streak itself) and at most floor(k/b)*T(b) + T(k mod b) (as many b-long streaks as fit; T is convex).
// * point blanks: a kill counts when the gray is < 4.2 m away, which any kill made during a dive can be, so the only hard bound is pointBlanks <= kills.
export const FK_MIN = 4.3;
export const streakT = (s) => (s >= 2 ? 250 * (s * (s + 1) / 2 - 1) : 0);
export const streakRange = (k, b) => (b < 1 || b > k ? null : [streakT(b), Math.floor(k / b) * streakT(b) + streakT(k % b)]);
export const maxStreakPts = (k) => streakT(k);
export const maxScoreV1 = (k) => k * 1500 + k * 300 + maxStreakPts(k) + k * 750 + (k ? fkBonus(FK_MIN) : 0); // 8 kills -> 30,430 (p4e: FK_MIN 4.4; was 30,335)
export function checkRunV1(r) { // v4.5.x rules (kept verbatim for old builds): returns an error string, or null if the run is plausible
  const int = (v) => Number.isInteger(v);
  if (!r || typeof r !== 'object') return 'bad body';
  const { score, souls, kills, bestStreak, streakPts, pointBlanks, firstKill, dur } = r;
  if (![score, souls, kills, bestStreak, streakPts, pointBlanks].every(int)) return 'bad numbers';
  if (kills < 0 || kills > TOTAL || souls !== kills) return 'bad kills';
  if (r.abducted != null && typeof r.abducted !== 'boolean') return 'bad body';
  if (r.restored != null && typeof r.restored !== 'boolean') return 'bad body'; // v4.8.0: a run continued after a reload says so; it is a flag only, every other rule is unchanged
  if (!canPost(r)) return 'no kills';
  if (!(typeof dur === 'number' && dur > 0 && dur <= MAX_DUR)) return 'bad duration';
  if (kills > 0 && !(typeof firstKill === 'number' && firstKill < dur && kills <= 1 + (dur - firstKill) / 2.5)) return 'bad timing'; // plausibility: a melt + the next ship take >= 2.5 s
  if (bestStreak < 0 || bestStreak > kills || pointBlanks < 0 || pointBlanks > kills || streakPts < 0 || streakPts > maxStreakPts(kills) || streakPts % 250) return 'bad parts';
  const sr = streakRange(kills, bestStreak); if (!sr || streakPts < sr[0] || streakPts > sr[1]) return 'bad streak'; // pass 3: streak points must add up for this best streak
  if (kills > 0 ? !(typeof firstKill === 'number' && firstKill >= FK_MIN && firstKill <= MAX_DUR) : firstKill != null) return 'bad first kill';
  const want = scoreOfV1(r);
  if (score !== want || score < 1 || score > maxScoreV1(kills)) return 'bad score';
  return null;
}
// ======================================================================================================================================
// p4f (v4.6.0) NEW SCORING (Chico, Oct 22): the game sends v = package version; v >= 4.6.0 is scored and validated with the V2 rules below,
// anything older (or with no v) keeps the V1 rules above, so a stale tab from before this build and every score already on the board stay valid.
//   gray kill      = 500
//   SAVED cow      = 1,500 x streak multiplier m = min(streak at the kill, 5)   (streak = kills chained without letting go of the beam, 1 for a lone kill)
//   cow shot       = -1,000 and the streak breaks (at most one hit per cow, so cowHits <= kills)
//   point blank    = +750 each, first-kill bonus = round((30 - firstKill) * 50)   (both unchanged from V1)
// run fields: score, souls (== kills), kills, bestStreak, cowPts (= 1,500 * sum of the kills' multipliers), cowHits, pointBlanks, firstKill, dur, abducted, v
export const SCORE = { KILL: 500, SAVE: 1500, COW_HIT: 1000, MULT_CAP: 5, PB: 750 };
export const V2_FROM = [4, 6, 0];
export const verOf = (v) => { const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v == null ? '' : v)); return m ? [+m[1], +m[2], +m[3]] : null; };
export const isV2 = (v) => { const a = verOf(v); if (!a) return false; for (let i = 0; i < 3; i++) { if (a[i] !== V2_FROM[i]) return a[i] > V2_FROM[i]; } return true; };
export const multOf = (streak) => Math.min(Math.max(streak, 1), SCORE.MULT_CAP);
export const runMult = (L) => { let t = 0; for (let s = 1; s <= L; s++) t += multOf(s); return t; }; // a chain of L kills pays multipliers 1,2,3,4,5,5,5...
// every way k kills can split into chains (a chain ends when you let go of the beam or shoot a cow): the achievable multiplier sums for best streak b
const PART = new Map();
function partsOf(k, b) { const key = k * 16 + b; if (PART.has(key)) return PART.get(key);
  const out = new Set(); const rec = (left, max, sum, hit) => { if (!left) { if (hit) out.add(sum); return; } for (let L = Math.min(left, max); L >= 1; L--) rec(left - L, L, sum + runMult(L), hit || L === b); };
  rec(k, b, 0, false); const arr = [...out].sort((x, y) => x - y); PART.set(key, arr); return arr; }
export const multSums = (k, b) => (b < 1 || b > k ? null : partsOf(k, b));
export const scoreOf = (r) => r.kills * SCORE.KILL + r.cowPts - r.cowHits * SCORE.COW_HIT + r.pointBlanks * SCORE.PB + fkBonus(r.firstKill); // ONE formula: the game scores with this too
export const maxScore = (k) => k * SCORE.KILL + SCORE.SAVE * runMult(k) + k * SCORE.PB + (k ? fkBonus(FK_MIN) : 0); // 8 kills -> 56,285 (one 8-chain, every kill a point blank, first kill at the 4.3 s floor, no cow shot)
export function checkRunV2(r) { // returns an error string, or null if the run is plausible
  const int = (v) => Number.isInteger(v);
  if (!r || typeof r !== 'object') return 'bad body';
  const { score, souls, kills, bestStreak, cowPts, cowHits, pointBlanks, firstKill, dur } = r;
  if (![score, souls, kills, bestStreak, cowPts, cowHits, pointBlanks].every(int)) return 'bad numbers';
  if (kills < 0 || kills > TOTAL || souls !== kills) return 'bad kills';
  if (r.abducted != null && typeof r.abducted !== 'boolean') return 'bad body';
  if (r.restored != null && typeof r.restored !== 'boolean') return 'bad body'; // v4.8.0: a run continued after a reload says so; it is a flag only, every other rule is unchanged
  if (!canPost(r)) return 'no kills';
  if (!(typeof dur === 'number' && dur > 0 && dur <= MAX_DUR)) return 'bad duration';
  if (kills > 0 && !(typeof firstKill === 'number' && firstKill < dur && kills <= 1 + (dur - firstKill) / 2.5)) return 'bad timing';
  if (bestStreak < 1 || bestStreak > kills || pointBlanks < 0 || pointBlanks > kills || cowHits < 0 || cowHits > kills || cowPts < 0 || cowPts % SCORE.SAVE) return 'bad parts';
  const sums = multSums(kills, bestStreak); if (!sums || !sums.includes(cowPts / SCORE.SAVE)) return 'bad streak'; // the saved-cow points must add up for exactly this best streak (exact: every chain split of k kills is enumerated)
  if (kills > 0 ? !(typeof firstKill === 'number' && firstKill >= FK_MIN && firstKill <= MAX_DUR) : firstKill != null) return 'bad first kill';
  const want = scoreOf(r);
  if (score !== want || score < 1 || score > maxScore(kills)) return 'bad score';
  return null;
}
export const checkRun = (r) => (r && typeof r === 'object' && isV2(r.v) ? checkRunV2(r) : checkRunV1(r)); // dispatch on the build version the run was played on
