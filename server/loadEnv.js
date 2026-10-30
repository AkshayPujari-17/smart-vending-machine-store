/**
 * Minimal .env loader (no dependencies).
 *
 * Reads the `.env` file in the project root and adds every KEY=VALUE pair to
 * `process.env`. Values that are already set in the real environment always
 * win, so a real environment variable can still override the file.
 *
 * This module MUST be the first import of server/index.js so that every other
 * module (e.g. auth.js reading SESSION_SECRET) sees the loaded values.
 *
 * Syntax supported:
 *   KEY=value
 *   KEY="value with spaces"
 *   KEY='value'
 *   export KEY=value
 *   # comments and blank lines are ignored
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export function loadEnv(file = path.join(ROOT, '.env')) {
  if (!fs.existsSync(file)) return { loaded: false, path: file, keys: [] };

  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    console.warn(`  ! Could not read ${file}: ${err.message}`);
    return { loaded: false, path: file, keys: [] };
  }

  const keys = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();

    if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else if (value.length > 1 && value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else {
      // strip an unquoted trailing comment:  value   # comment
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash);
      value = value.trim();
    }

    // Real environment variables take precedence over the file.
    if (process.env[key] === undefined) {
      process.env[key] = value;
      keys.push(key);
    }
  }

  return { loaded: true, path: file, keys };
}

loadEnv();
