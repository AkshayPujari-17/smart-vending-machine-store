/**
 * Generates local product images (SVG) for the vending machine.
 * Run with:  npm run seed-images
 *
 * Every product gets a stylised can / bottle / juice-carton illustration with
 * brand colours, so the app has attractive assets without any external
 * image downloads.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'img', 'products');

const PRODUCTS = [
  { code: 'A1', name: 'Coca-Cola', volume: '250 ml', type: 'can', color: '#E4002B', dark: '#9E0020', text: '#FFFFFF' },
  { code: 'A2', name: 'Pepsi', volume: '250 ml', type: 'can', color: '#004B93', dark: '#00316A', text: '#FFFFFF' },
  { code: 'A3', name: 'Sprite', volume: '250 ml', type: 'can', color: '#00A94F', dark: '#007C39', text: '#FFFFFF' },
  { code: 'A4', name: 'Thums Up', volume: '250 ml', type: 'can', color: '#16182F', dark: '#090A18', text: '#FFD400' },
  { code: 'B1', name: 'Fanta', volume: '250 ml', type: 'can', color: '#FF7A00', dark: '#D25C00', text: '#FFFFFF' },
  { code: 'B2', name: 'Mountain Dew', volume: '250 ml', type: 'can', color: '#7AB800', dark: '#4F8000', text: '#E4002B' },
  { code: 'B3', name: 'Red Bull', volume: '250 ml', type: 'slim', color: '#0B4EA2', dark: '#07356F', text: '#FFFFFF' },
  { code: 'B4', name: 'Sting', volume: '250 ml', type: 'can', color: '#E1000F', dark: '#A1000A', text: '#FFE000' },
  { code: 'C1', name: 'Real', volume: 'Fruit Juice', type: 'carton', color: '#F37021', dark: '#C5520F', text: '#FFFFFF' },
  { code: 'C2', name: 'Maaza', volume: 'Mango Drink', type: 'carton', color: '#F5C400', dark: '#D9A400', text: '#007A3D' },
  { code: 'C3', name: 'Frooti', volume: 'Mango Drink', type: 'carton', color: '#6CB33F', dark: '#4B8D29', text: '#FFF200' },
  { code: 'C4', name: 'Water', volume: '500 ml', type: 'bottle', color: '#BFE9FF', dark: '#79C7F0', text: '#005E9E' },
];

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function wrapLabel(text) {
  const words = text.split(' ');
  if (words.length === 1 || text.length <= 9) return [text];
  if (text.length <= 14) {
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  }
  const first = words[0];
  return [first, words.slice(1).join(' ')];
}

function defs(id, color, dark) {
  return `
  <defs>
    <linearGradient id="body-${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${dark}"/>
      <stop offset="18%" stop-color="${color}"/>
      <stop offset="42%" stop-color="${lighten(color, 28)}"/>
      <stop offset="62%" stop-color="${color}"/>
      <stop offset="100%" stop-color="${dark}"/>
    </linearGradient>
    <linearGradient id="metal-${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#8d939c"/>
      <stop offset="35%" stop-color="#f2f4f7"/>
      <stop offset="70%" stop-color="#c9ced6"/>
      <stop offset="100%" stop-color="#7d838c"/>
    </linearGradient>
    <linearGradient id="shine-${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45"/>
      <stop offset="45%" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>`;
}

function lighten(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + amount);
  const g = Math.min(255, ((n >> 8) & 255) + amount);
  const b = Math.min(255, (n & 255) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function labelText(lines, color, y, size) {
  return lines
    .map(
      (line, i) =>
        `<text x="120" y="${y + i * (size + 6)}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="${size}" fill="${color}" letter-spacing="0.5">${esc(line)}</text>`
    )
    .join('\n  ');
}

function canSvg(p, slim) {
  const w = slim ? 78 : 118;
  const x = 120 - w / 2;
  const top = slim ? 46 : 54;
  const bottom = slim ? 314 : 306;
  const labelY = slim ? 140 : 132;
  const labelH = slim ? 108 : 120;
  const lines = wrapLabel(p.name);
  const size = Math.min(24, lines.length > 1 ? 20 : 26);
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 360" width="240" height="360" role="img" aria-label="${esc(p.name)}">
  ${defs(p.code, p.color, p.dark)}
  <ellipse cx="120" cy="332" rx="${w * 0.62}" ry="12" fill="#000" opacity="0.28"/>
  <rect x="${x}" y="${top}" width="${w}" height="${bottom - top}" rx="${slim ? 26 : 24}" fill="url(#body-${p.code})"/>
  <rect x="${x}" y="${top}" width="${w}" height="${bottom - top}" rx="${slim ? 26 : 24}" fill="url(#shine-${p.code})"/>
  <ellipse cx="120" cy="${top + 6}" rx="${w / 2 - 4}" ry="9" fill="url(#metal-${p.code})"/>
  <ellipse cx="120" cy="${top + 5}" rx="${w / 2 - 16}" ry="5" fill="#b9bec6"/>
  <ellipse cx="120" cy="${bottom - 4}" rx="${w / 2 - 6}" ry="7" fill="${p.dark}" opacity="0.85"/>
  <rect x="${x}" y="${labelY}" width="${w}" height="${labelH}" fill="${p.color}" opacity="0.96"/>
  <rect x="${x}" y="${labelY}" width="${w}" height="6" fill="#ffffff" opacity="0.35"/>
  <rect x="${x}" y="${labelY + labelH - 6}" width="${w}" height="6" fill="#000000" opacity="0.18"/>
  ${labelText(lines, p.text, lines.length > 1 ? labelY + labelH / 2 - 6 : labelY + labelH / 2 + 8, size)}
  <text x="120" y="${labelY + labelH - 16}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="13" fill="${p.text}" opacity="0.9">${esc(p.volume)}</text>
</svg>`;
}

function cartonSvg(p) {
  const x = 62;
  const y = 78;
  const w = 116;
  const h = 224;
  const lines = wrapLabel(p.name);
  const size = lines.length > 1 ? 22 : 26;
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 360" width="240" height="360" role="img" aria-label="${esc(p.name)}">
  ${defs(p.code, p.color, p.dark)}
  <ellipse cx="120" cy="322" rx="66" ry="12" fill="#000" opacity="0.28"/>
  <path d="M${x} ${y} L120 ${y - 44} L${x + w} ${y} Z" fill="#f4f6f8"/>
  <path d="M${x} ${y} L120 ${y - 44} L${x + w} ${y} Z" fill="#000" opacity="0.08"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="url(#body-${p.code})"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="url(#shine-${p.code})"/>
  <rect x="${x}" y="${y + 70}" width="${w}" height="96" fill="${p.color}" opacity="0.95"/>
  <rect x="${x}" y="${y + 70}" width="${w}" height="6" fill="#ffffff" opacity="0.4"/>
  ${labelText(lines, p.text, lines.length > 1 ? y + 70 + 42 : y + 70 + 58, size)}
  <text x="120" y="${y + 70 + 84}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="13" fill="${p.text}" opacity="0.95">${esc(p.volume)}</text>
  <rect x="${x + 10}" y="${y + 12}" width="${w - 20}" height="6" rx="3" fill="#ffffff" opacity="0.5"/>
  <g transform="rotate(18 176 120)">
    <rect x="170" y="60" width="9" height="72" rx="4.5" fill="#f7f8fa"/>
    <rect x="170" y="60" width="9" height="18" rx="4.5" fill="#e2e5ea"/>
  </g>
</svg>`;
}

function bottleSvg(p) {
  const water = p.code === 'C4';
  const bodyFill = water ? '#dff3ff' : p.color;
  const capColor = water ? '#00A3E0' : p.dark;
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 360" width="240" height="360" role="img" aria-label="${esc(p.name)}">
  ${defs(p.code, bodyFill, water ? '#a8dcf7' : p.dark)}
  <ellipse cx="120" cy="332" rx="56" ry="11" fill="#000" opacity="0.28"/>
  <rect x="98" y="30" width="44" height="30" rx="7" fill="${capColor}"/>
  <rect x="98" y="38" width="44" height="6" fill="#ffffff" opacity="0.35"/>
  <path d="M104 60 h32 v22 c0 10 26 16 26 44 v150 c0 14 -12 24 -26 24 h-32 c-14 0 -26 -10 -26 -24 v-150 c0 -28 26 -34 26 -44 z"
        fill="url(#body-${p.code})"/>
  <path d="M104 60 h32 v22 c0 10 26 16 26 44 v150 c0 14 -12 24 -26 24 h-32 c-14 0 -26 -10 -26 -24 v-150 c0 -28 26 -34 26 -44 z"
        fill="url(#shine-${p.code})" opacity="${water ? 0.9 : 0.7}"/>
  <rect x="66" y="168" width="108" height="86" fill="${water ? '#00A3E0' : p.color}" opacity="${water ? 0.9 : 0.95}"/>
  <rect x="66" y="168" width="108" height="6" fill="#ffffff" opacity="0.4"/>
  ${labelText(wrapLabel(p.name), water ? '#FFFFFF' : p.text, wrapLabel(p.name).length > 1 ? 196 : 212, water ? 22 : 24)}
  <text x="120" y="242" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="13" fill="${water ? '#FFFFFF' : p.text}" opacity="0.95">${esc(p.volume)}</text>
</svg>`;
}

function buildSvg(p) {
  if (p.type === 'carton') return cartonSvg(p);
  if (p.type === 'bottle') return bottleSvg(p);
  if (p.type === 'slim') return canSvg(p, true);
  return canSvg(p, false);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
let count = 0;
for (const p of PRODUCTS) {
  const file = path.join(OUT_DIR, `${p.code.toLowerCase()}.svg`);
  fs.writeFileSync(file, buildSvg(p).trim() + '\n', 'utf8');
  count += 1;
}
console.log(`✔ Generated ${count} product images in ${OUT_DIR}`);
