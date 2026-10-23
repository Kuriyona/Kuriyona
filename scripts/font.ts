import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
const filename = import.meta.filename as string;
const dirname = path.dirname(filename);

// Pinned so a render is reproducible; bump both the tag and the archive together.
const RELEASE = 'v7.9';
const RELEASE_BASE = `https://github.com/subframe7536/maple-font/releases/download/${RELEASE}`;
const ARCHIVE = 'MapleMono-TTF.zip';

const FONT_DIR = path.join(dirname, '..', '.cache', 'fonts');
const FAMILY = 'Maple Mono';
// renderSVG emits `font-weight: bold`, so both faces ship together.
const FACES = ['MapleMono-Regular.ttf', 'MapleMono-Bold.ttf'];

const download = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Font download failed (${response.status}): ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
};

// Minimal zip reader: only stored and deflated entries, which is what the
// release archive uses. Avoids shelling out to unzip/Expand-Archive.
const readZip = (archive: Buffer) => {
  const entries = new Map<string, Buffer>();
  let end = archive.length - 22;
  while (end >= 0 && archive.readUInt32LE(end) !== 0x06054b50) {
    end -= 1;
  }
  if (end < 0) {
    throw new Error('Font archive is not a zip file');
  }
  const count = archive.readUInt16LE(end + 10);
  let cursor = archive.readUInt32LE(end + 16);
  for (let index = 0; index < count; index++) {
    if (archive.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('Malformed zip central directory');
    }
    const method = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const name = archive.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    const dataStart =
      localOffset + 30 + archive.readUInt16LE(localOffset + 26) + archive.readUInt16LE(localOffset + 28);
    const raw = archive.subarray(dataStart, dataStart + compressedSize);
    entries.set(path.basename(name), method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
};

const isMissing = (file: string) => fs.access(file).then(() => false, () => true);

export const loadFont = async () => {
  const fontFiles = FACES.map((face) => path.join(FONT_DIR, face));
  const missing = await Promise.all(fontFiles.map(isMissing));
  if (missing.some(Boolean)) {
    const [archive, checksum] = await Promise.all([
      download(`${RELEASE_BASE}/${ARCHIVE}`),
      download(`${RELEASE_BASE}/${ARCHIVE.replace(/\.zip$/, '.sha256')}`),
    ]);
    const digest = crypto.createHash('sha256').update(archive).digest('hex');
    if (digest !== checksum.toString('utf8').trim()) {
      throw new Error(`Font archive checksum mismatch: expected ${checksum}, got ${digest}`);
    }
    const entries = readZip(archive);
    await fs.mkdir(FONT_DIR, { recursive: true });
    for (const face of FACES) {
      const data = entries.get(face);
      if (!data) {
        throw new Error(`${face} is missing from ${ARCHIVE}`);
      }
      await fs.writeFile(path.join(FONT_DIR, face), data);
    }
    console.log(`Fonts: ${FONT_DIR}`);
  }
  // Host fonts are ignored so local and CI renders are identical.
  return { loadSystemFonts: false, fontFiles, defaultFontFamily: FAMILY };
};
