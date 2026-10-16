// Throwaway: after unioning two modules into one file, duplicate imports/declarations are the thing that breaks it.
import fs from 'node:fs';

const cwd = process.argv[2];
const text = fs.readFileSync(`${cwd}/public/js/assetCache.js`, 'utf8');
const lines = text.split('\n');

// duplicate `import ... from '...'`
const imports = new Map();
for (const l of lines) {
  const m = /^import\s+(?:(\{[^}]*\})|(\w+))\s+from\s+'([^']+)'/.exec(l);
  if (!m) continue;
  const names = (m[1] || m[2] || '').replace(/[{}]/g, '').split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean);
  for (const n of names) {
    if (!imports.has(n)) imports.set(n, []);
    imports.get(n).push(m[3]);
  }
}
const dupImports = [...imports].filter(([, v]) => v.length > 1);
console.log('重复 import 的符号:', dupImports.length ? '' : '（无）');
for (const [n, v] of dupImports) console.log(`  ⚠️  ${n}  ←  ${[...new Set(v)].join(', ')}`);

// duplicate top-level const/let/function/class
const decls = new Map();
lines.forEach((l, i) => {
  const m = /^(?:export\s+)?(?:const|let|var|function|class|async function)\s+([A-Za-z_$][\w$]*)/.exec(l);
  if (!m) return;
  if (!decls.has(m[1])) decls.set(m[1], []);
  decls.get(m[1]).push(i + 1);
});
const dupDecls = [...decls].filter(([, v]) => v.length > 1);
console.log('');
console.log('重复声明:', dupDecls.length ? '' : '（无）');
for (const [n, v] of dupDecls) console.log(`  ⚠️  ${n}  行 ${v.join(', ')}`);
