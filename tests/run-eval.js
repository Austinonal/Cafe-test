/* node tests/run-eval.js [--update-golden] [--json]   — exit code 1 when anything fails */
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const w = { localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, document: {} }; w.window = w; w.CM = {};
vm.createContext(w);
['icons', 'data', 'engine'].forEach((f) => { try { vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), w, { filename: f }); } catch (e) { if (f !== 'icons') throw e; } });
const gp = path.join(__dirname, 'golden.json'); const golden = fs.existsSync(gp) ? JSON.parse(fs.readFileSync(gp, 'utf8')) : null;
const r = require('./eval.js').run(w.CM, golden);
if (process.argv.includes('--update-golden')) { fs.writeFileSync(gp, JSON.stringify(r.goldenNow, null, 1)); fs.writeFileSync(path.join(__dirname, 'golden.js'), 'window.CM_GOLDEN = ' + JSON.stringify(r.goldenNow) + ';'); console.log('golden updated'); process.exit(0); }
if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 1)); process.exit(0); }
const mark = (ok) => (ok ? '✓' : '✗'); let fail = 0;
let warn = 0;
const line = (ok, t, n, sev) => { if (!ok && sev) warn++; else if (!ok) fail++; console.log(' ' + (ok ? '✓' : sev ? '⚠' : '✗') + ' ' + t + (n ? '  — ' + n : '')); };
console.log('\nCASES'); r.cases.forEach((c) => line(c.ok, c.id + ' ' + c.title, c.ok ? '' : c.note, c.sev));
console.log('\nINVARIANTS'); r.invariants.forEach((c) => line(c.ok, c.title, c.ok ? '' : c.note));
console.log('\nGOLDEN'); r.golden.forEach((g) => line(g.status !== 'changed', g.id + ' ' + g.status, g.status === 'changed' ? g.was.join(',') + ' → ' + g.top.join(',') : ''));
console.log('\nFAIRNESS (' + r.fairness.sessions + ' sessions)'); r.fairness.checks.forEach((c) => line(c.ok, c.title, c.note, c.sev));
console.log('\n' + (fail ? fail + ' FAILED' : 'PASSED') + (warn ? ' (' + warn + ' warnings: known issues / things to look at)' : '') + ' — ' + (r.cases.length + r.invariants.length + r.golden.length + r.fairness.checks.length) + ' checks');
process.exit(fail ? 1 : 0);
