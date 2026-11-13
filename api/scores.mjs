// CR9 "WITNESSES OF COUNTY ROAD 9" board. Vercel Function + a PRIVATE Vercel Blob store (BLOB_READ_WRITE_TOKEN from the linked store).
// ONE FILE PER SCORE, so simultaneous saves can never overwrite each other. Everything GET needs is in the pathname,
// so the board is one list() call and no file reads:  scores/<ts13>-<rand6>-<score7>-<kills>[a]-<iphash8>-<NAME_WITH_UNDERSCORES>.json  ('a' = abducted run)  (p4e: non-production deployments use scores-preview/)
import { put, list } from '@vercel/blob';
import { createHash, randomBytes } from 'node:crypto';
import { cleanName, validName, checkRun } from './_lib.mjs';
const PREFIX = process.env.VERCEL_ENV === 'production' ? 'scores/' : 'scores-preview/', TOP = 10, RATE_MS = 30000;
const json = (o, status = 200, cache = 'no-store') => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });
const ipOf = (req) => (req.headers.get('x-real-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || 'unknown').trim();
const ipKey = (ip) => (ip.includes(':') ? ip.split(':').slice(0, 4).join(':') + '::/64' : ip); // IPv6: rate-limit the /64 (one subscriber), not the rotating host bits
const ipHash = (ip) => createHash('sha256').update('cr9-witness:' + ipKey(ip)).digest('hex').slice(0, 8);
function parse(p) { if (!p.startsWith(PREFIX)) return null; // p4e DANA: preview deployments read/write scores-preview/, never the live scores/ board
 
  const m = /^scores(?:-preview)?\/(\d{13})-([a-z0-9]{6})-(\d{7})-(\d)(a?)-([0-9a-f]{8})-([A-Z0-9_]{1,10})\.json$/.exec(p); if (!m) return null;
  return { id: `${m[1]}-${m[2]}`, ts: +m[1], score: +m[3], souls: +m[4], kills: +m[4], abducted: m[5] === 'a', ip: m[6], name: m[7].replace(/_/g, ' ') };
}
async function all() { const out = []; let cursor;
  do { const r = await list({ prefix: PREFIX, limit: 1000, cursor }); for (const b of r.blobs) { const e = parse(b.pathname); if (e) out.push(e); } cursor = r.hasMore ? r.cursor : undefined; } while (cursor && out.length < 20000);
  return out.sort((a, b) => b.score - a.score || a.ts - b.ts); }
const pub = ({ id, name, score, souls, abducted, ts }, i) => ({ rank: i + 1, id, name, score, souls, abducted, ts });
const mem = new Map(); // fast per-instance rate limit; the authoritative check is the iphash in recent pathnames (works across instances)
export async function GET(req) {
  try { const s = await all(); const q = new URL(req.url).searchParams; if (q.get('all')) { const off = Math.max(0, parseInt(q.get('offset')) || 0), lim = Math.min(100, Math.max(1, parseInt(q.get('limit')) || 100)); return json({ ok: true, rows: s.slice(off, off + lim).map((e, k) => pub(e, off + k)), offset: off, total: s.length }, 200, 'public, max-age=0, s-maxage=10'); } // full master list, paged (the board itself still shows only the top 10)
    return json({ ok: true, top: s.slice(0, TOP).map(pub), total: s.length }, 200, 'public, max-age=0, s-maxage=15'); }
  catch (e) { return json({ ok: false, error: 'board unavailable' }, 503); }
}
export async function POST(req) {
  const ip = ipOf(req), h = ipHash(ip), now = Date.now();
  if (now - (mem.get(h) || 0) < RATE_MS) return json({ ok: false, error: 'slow down: one entry per 30 s' }, 429);
  let body; try { const t = await req.text(); if (t.length > 2048) return json({ ok: false, error: 'too big' }, 413); body = JSON.parse(t); } catch { return json({ ok: false, error: 'bad json' }, 400); }
  const name = cleanName(body.name).trim(); if (!validName(name)) return json({ ok: false, error: 'pick another name' }, 400);
  const bad = checkRun(body); if (bad) return json({ ok: false, error: bad }, 400);
  try {
    let s = await all(); if (s.some((e) => e.ip === h && now - e.ts < RATE_MS)) return json({ ok: false, error: 'slow down: one entry per 30 s' }, 429);
    mem.set(h, now); const rand = randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '0').slice(0, 6).padEnd(6, '0');
    const path = `${PREFIX}${now}-${rand}-${String(body.score).padStart(7, '0')}-${body.kills}${body.abducted ? 'a' : ''}-${h}-${name.replace(/ /g, '_')}.json`;
    await put(path, JSON.stringify({ name, score: body.score, souls: body.souls, kills: body.kills, bestStreak: body.bestStreak, streakPts: body.streakPts, cowPts: body.cowPts, cowHits: body.cowHits, pointBlanks: body.pointBlanks, firstKill: body.firstKill, dur: body.dur, abducted: !!body.abducted, restored: body.restored === true, v: String(body.v || '').slice(0, 12), ts: now }),
      { access: 'private', contentType: 'application/json', addRandomSuffix: false });
    const me = parse(path); if (!s.some((e) => e.id === me.id)) s = s.concat(me).sort((a, b) => b.score - a.score || a.ts - b.ts);
    const i = s.findIndex((e) => e.id === me.id);
    return json({ ok: true, id: me.id, rank: i + 1, total: s.length, top: s.slice(0, TOP).map(pub), above: i > 0 ? pub(s[i - 1], i - 1) : null, below: i < s.length - 1 ? pub(s[i + 1], i + 1) : null });
  } catch (e) { return json({ ok: false, error: 'board unavailable' }, 503); }
}
