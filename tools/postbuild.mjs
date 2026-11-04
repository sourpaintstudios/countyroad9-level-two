// v4.4: ship the leaderboard Vercel Function next to the static build (we deploy dist/). WAV never ships.
import fs from 'fs';
fs.mkdirSync('dist/api', { recursive: true });
for (const f of ['scores.mjs', '_lib.mjs']) fs.copyFileSync(`api/${f}`, `dist/api/${f}`);
fs.writeFileSync('dist/package.json', JSON.stringify({ name: 'cr9-test-scene', private: true, type: 'module', engines: { node: '>=20' }, dependencies: { '@vercel/blob': '2.8.2' } }, null, 1));
const bad = []; const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = `${d}/${f.name}`; if (f.isDirectory()) walk(p); else if (/\.wav$/i.test(f.name)) bad.push(p); } }; walk('dist');
if (bad.length) { console.error('WAV in dist:', bad); process.exit(1); }
console.log('postbuild: api + package.json copied, no WAV');
// keep dist/ linked to the cr9-test-scene project (vite empties dist/ on every build). Not a secret: ids only.
fs.mkdirSync('dist/.vercel', { recursive: true });
fs.writeFileSync('dist/.vercel/project.json', JSON.stringify({ projectId: 'prj_yHEvqrympgoXjGYtZLGhzr5YYgvG', orgId: 'team_SD9azpMGl2l8S6cXeu63YuTu', projectName: 'cr9-test-scene' }));
