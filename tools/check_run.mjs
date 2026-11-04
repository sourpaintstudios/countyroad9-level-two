// harness helper: reads a POST body on stdin, prints the server verdict (same rules as api/scores.mjs)
import { checkRun, validName, cleanName } from '../api/_lib.mjs';
let b = ''; process.stdin.on('data', (d) => (b += d)); process.stdin.on('end', () => { let r; try { r = JSON.parse(b); } catch { return console.log('bad json'); }
  const n = cleanName(r.name).trim(); if (!validName(n)) return console.log('pick another name'); console.log(checkRun(r) || 'OK'); });
