import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('public/assets');
for (const directory of ['models', 'textures', 'config', 'audio', 'fonts']) await mkdir(resolve(root, directory), { recursive: true });
const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#536269"/><path d="M0 0h256v256H0zM128 0v256M0 128h256" stroke="#3f4d53" stroke-width="2"/><path d="M3 3h122v122H3zM131 131h122v122H131z" fill="#58676d" opacity=".4"/></svg>`;
const carpet = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#414c54"/><pattern id="p" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 2h8M2 0v8" stroke="#637078" stroke-width=".6" opacity=".35"/></pattern><rect width="128" height="128" fill="url(#p)"/></svg>`;
await writeFile(resolve(root, 'textures/office-tile.svg'), tile);
await writeFile(resolve(root, 'textures/carpet.svg'), carpet);
await writeFile(resolve(root, 'textures/dust.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><defs><radialGradient id="g"><stop stop-color="#c6dbcf" stop-opacity=".8"/><stop offset="1" stop-color="#c6dbcf" stop-opacity="0"/></radialGradient></defs><circle cx="16" cy="16" r="15" fill="url(#g)"/></svg>');
await writeFile(resolve(root, 'config/office-layout.json'), JSON.stringify({ unit: 'meter', desk: [2.7, 0.82, 1.4] }, null, 2));
await writeFile(resolve(root, 'config/gameplay-timing.json'), JSON.stringify({ elevatorCloseSeconds: 2.4 }, null, 2));
// Original 16-bit PCM wave synthesis. Offline audio files, never runtime remote URLs.
function wave(name, seconds, synth) {
  const rate = 22050, count = Math.floor(seconds * rate), data = Buffer.alloc(44 + count * 2);
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.floor(synth(i / rate, i) * 32767))), 44 + i * 2);
  return writeFile(resolve(root, `audio/${name}.wav`), data);
}
let seed = 13579;
const noise = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
await wave('footstep', 0.16, (t) => noise() * 0.22 * Math.exp(-t * 35) + Math.sin(t * 260) * 0.15 * Math.exp(-t * 26));
await wave('alert', 0.65, (t) => Math.sin(2 * Math.PI * (t < 0.32 ? 660 : 440) * t) * 0.24 * Math.min(1, t * 40) * Math.min(1, (0.65 - t) * 20));
await wave('lift-bell', 1.3, (t) => (Math.sin(2 * Math.PI * 784 * t) + Math.sin(2 * Math.PI * 1046.5 * t)) * 0.16 * Math.exp(-t * 3));
await wave('interact', 0.17, (t) => Math.sin(2 * Math.PI * 1046.5 * t) * 0.12 * Math.exp(-t * 24));
await wave('printer', 1.2, (t) => (noise() * 0.05 + Math.sin(2 * Math.PI * 90 * t) * 0.06) * Math.sin(Math.PI * t / 1.2));
await wave('ambient', 8, (t) => (Math.sin(2 * Math.PI * 55 * t) + Math.sin(2 * Math.PI * 82.5 * t) * 0.5) * 0.028);
await writeFile(resolve(root, 'fonts/README.txt'), 'System font stack only. No font downloads or remotely loaded fonts.');
console.log('Generated layout/timing configuration, original textures and six PCM sounds. Imported models are built separately with Blender.');
