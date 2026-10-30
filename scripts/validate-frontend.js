/**
 * Frontend static validation:
 *  - every ES module parses
 *  - every relative import specifier resolves to a real file
 *  - every script/link/img reference in the HTML exists on disk
 *
 * Run with:  node scripts/validate-frontend.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

let failures = 0;
const ok = (cond, label, extra = '') => {
  console.log(`  ${cond ? '✔' : '✘'} ${label}${!cond ? `  [${extra}]` : ''}`);
  if (!cond) failures += 1;
};

function walk(dir, filter) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, filter));
    else if (filter(entry.name)) out.push(full);
  }
  return out;
}

console.log('\n  Frontend validation');

// 1. syntax check every module with node --check
const modules = walk(PUBLIC, (name) => name.endsWith('.js'));
for (const file of modules) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    ok(true, `syntax OK  ${path.relative(ROOT, file)}`);
  } catch (err) {
    ok(false, `syntax OK  ${path.relative(ROOT, file)}`, String(err.stderr || err.message));
  }
}

// 2. relative import specifiers resolve
for (const file of modules) {
  const source = fs.readFileSync(file, 'utf8');
  const specifiers = [...source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
  for (const spec of specifiers) {
    const target = path.resolve(path.dirname(file), spec);
    ok(fs.existsSync(target), `import resolves  ${path.relative(ROOT, file)} → ${spec}`);
  }
}

// 3. HTML references exist
for (const htmlFile of [path.join(PUBLIC, 'index.html'), path.join(PUBLIC, 'admin', 'index.html')]) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (ref.startsWith('/api')) continue;
    const target = path.join(PUBLIC, ref.replace(/^\//, ''));
    ok(fs.existsSync(target), `asset exists  ${path.relative(ROOT, htmlFile)} → ${ref}`);
  }
}

// 4. every id referenced by the scripts exists in the HTML (machine page)
{
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const scripts = walk(path.join(PUBLIC, 'js'), (name) => name.endsWith('.js'));
  const ids = new Set();
  for (const file of scripts) {
    const source = fs.readFileSync(file, 'utf8');
    for (const m of source.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) ids.add(m[1]);
    for (const m of source.matchAll(/querySelector\(['"]#([A-Za-z0-9_-]+)['"]\)/g)) ids.add(m[1]);
  }
  for (const id of ids) {
    ok(new RegExp(`id="${id}"`).test(html), `DOM id present in index.html → #${id}`);
  }
}

console.log(`\n  ${failures === 0 ? 'All frontend checks passed.' : `${failures} frontend check(s) failed.`}\n`);
process.exit(failures === 0 ? 0 : 1);
