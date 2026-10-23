import fs from 'node:fs/promises';
import path from 'node:path';
const filename = import.meta.filename as string;
const dirname = path.dirname(filename);
import { purgeCache, s3 } from './utils';

// Public access: https://r2.kuriyona.com/img/readme/intro.{svg,png}
const PUBLIC_BASE = 'https://r2.kuriyona.com';
const KEY_PREFIX = 'img/readme';
const SOURCE_DIR = path.join(dirname, '..', '.cache');

const files = [
  { name: 'intro.svg', contentType: 'image/svg+xml' },
  { name: 'intro.png', contentType: 'image/png' },
];

const urls: string[] = [];
for (const { name, contentType } of files) {
  const key = `${KEY_PREFIX}/${name}`;
  const data = await fs.readFile(path.join(SOURCE_DIR, name));
  // Explicit content type: the bucket default is application/octet-stream,
  // which makes browsers download the card instead of rendering it.
  await s3.file(key).write(data, { type: contentType });
  urls.push(`${PUBLIC_BASE}/${key}`);
  console.log(`Uploaded ${name} -> ${urls.at(-1)}`);
}

await purgeCache({ files: urls });
console.log(`Purged cache for ${urls.length} URLs`);
