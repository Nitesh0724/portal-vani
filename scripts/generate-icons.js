import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

function createIcon(size, isMaskable = false) {
  const png = new PNG({ width: size, height: size });
  const center = size / 2;
  const radius = isMaskable ? size * 0.45 : size * 0.48;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Background color: Deep Navy Slate (#0f172a)
      let r = 15, g = 23, b = 42, a = 255;

      // Outer gold circle border
      if (dist <= radius && dist >= radius - (size * 0.04)) {
        r = 217; g = 119; b = 6; // Amber Gold
      } else if (dist < radius - (size * 0.04) && dist >= radius - (size * 0.06)) {
        r = 245; g = 158; b = 11; // Bright Gold accent
      } else if (dist < radius - (size * 0.06)) {
        // Inner circle: rich indigo/slate (#1e1b4b)
        r = 30; g = 27; b = 75;
      }

      // Draw emblem badge in center
      // Shield / Star / Train silhouette coordinates
      const boxW = size * 0.4;
      const boxH = size * 0.45;
      if (Math.abs(dx) <= boxW / 2 && dy >= -boxH / 2 && dy <= boxH / 2) {
        // Star or badge center
        const badgeDist = Math.sqrt(dx * dx + (dy + size * 0.05) * (dy + size * 0.05));
        if (badgeDist < size * 0.16) {
          r = 251; g = 191; b = 36; // Amber-400
        } else if (dy > size * 0.05 && dy < size * 0.22 && Math.abs(dx) < size * 0.2) {
          // Bottom TA plate
          r = 255; g = 255; b = 255; // Crisp White
        }
      }

      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }

  return PNG.sync.write(png);
}

const publicDir = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createIcon(192));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createIcon(512));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createIcon(512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createIcon(180));
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), createIcon(48));

console.log('PWA icons successfully generated in public directory!');
