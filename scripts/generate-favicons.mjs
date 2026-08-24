import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const source = path.resolve('src/assets/16-bit-avatar-favicon.png');
const cutout = path.resolve('src/assets/16-bit-avatar-cutout.png');
const outputDir = path.resolve('public/favicon');
const sizes = [16, 32, 48, 180, 192, 512];

await mkdir(outputDir, { recursive: true });

const { data, info } = await sharp(source).raw().toBuffer({ resolveWithObject: true });
const visited = new Uint8Array(info.width * info.height);
const queue = [];
const isBackground = (index) => {
  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  return Math.min(red, green, blue) > 150 && Math.max(red, green, blue) - Math.min(red, green, blue) < 18;
};
const enqueue = (x, y) => {
  const pixel = y * info.width + x;
  if (visited[pixel] || !isBackground(pixel * info.channels)) return;
  visited[pixel] = 1;
  queue.push(pixel);
};

for (let x = 0; x < info.width; x += 1) {
  enqueue(x, 0);
  enqueue(x, info.height - 1);
}
for (let y = 0; y < info.height; y += 1) {
  enqueue(0, y);
  enqueue(info.width - 1, y);
}

for (let cursor = 0; cursor < queue.length; cursor += 1) {
  const pixel = queue[cursor];
  const x = pixel % info.width;
  const y = Math.floor(pixel / info.width);
  if (x > 0) enqueue(x - 1, y);
  if (x < info.width - 1) enqueue(x + 1, y);
  if (y > 0) enqueue(x, y - 1);
  if (y < info.height - 1) enqueue(x, y + 1);
}

for (let pixel = 0; pixel < visited.length; pixel += 1) {
  if (visited[pixel]) data[pixel * info.channels + 3] = 0;
}

const cutoutBuffer = await sharp(data, { raw: info }).png().toBuffer();
await writeFile(cutout, cutoutBuffer);
const zoomCrop = Math.round(Math.min(info.width, info.height) / 1.16);
const zoomedCutoutBuffer = await sharp(cutoutBuffer)
  .extract({
    left: Math.round((info.width - zoomCrop) / 2),
    top: Math.round((info.height - zoomCrop) / 2),
    width: zoomCrop,
    height: zoomCrop,
  })
  .png()
  .toBuffer();

const pngs = new Map();
for (const size of sizes) {
  const avatar = await sharp(zoomedCutoutBuffer)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const badge = Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#24231f"/></svg>`);
  pngs.set(size, await sharp(badge).png().composite([{ input: avatar }]).png().toBuffer());
}

await Promise.all([
  writeFile(path.join(outputDir, 'favicon-16x16.png'), pngs.get(16)),
  writeFile(path.join(outputDir, 'favicon-32x32.png'), pngs.get(32)),
  writeFile(path.join(outputDir, 'favicon-48x48.png'), pngs.get(48)),
  writeFile(path.join(outputDir, 'apple-touch-icon.png'), pngs.get(180)),
  writeFile(path.join(outputDir, 'android-chrome-192x192.png'), pngs.get(192)),
  writeFile(path.join(outputDir, 'android-chrome-512x512.png'), pngs.get(512)),
]);

const icoSizes = [16, 32, 48];
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);

const directory = Buffer.alloc(16 * icoSizes.length);
let offset = header.length + directory.length;
const entries = [];
for (let index = 0; index < icoSizes.length; index += 1) {
  const size = icoSizes[index];
  const image = pngs.get(size);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0);
  entry.writeUInt8(size === 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(image.length, 8);
  entry.writeUInt32LE(offset, 12);
  entry.copy(directory, index * 16);
  entries.push(image);
  offset += image.length;
}

await writeFile(path.join(outputDir, 'favicon.ico'), Buffer.concat([header, directory, ...entries]));
