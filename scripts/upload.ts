import fs from 'node:fs/promises';
import path from 'node:path';
const filename = import.meta.filename as string;
const dirname = path.dirname(filename);
import { KEY_PREFIX, PUBLIC_BASE } from './cdn.ts';
import { purgeCache, uploadObject } from './utils.ts';

const SOURCE_DIR = path.join(dirname, '..', '.cache');

// Producers write into .cache; this list is the whole publish set.
const FILES = ['intro.svg', 'intro.png', 'contributions.svg', 'contributions.png'];

const CONTENT_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const urls: string[] = [];
for (const name of FILES) {
  const contentType = CONTENT_TYPES[path.extname(name)];
  if (!contentType) {
    throw new Error(`No content type for ${name}`);
  }
  const key = `${KEY_PREFIX}/${name}`;
  const data = await fs.readFile(path.join(SOURCE_DIR, name));
  // Explicit content type: the bucket default is application/octet-stream,
  // which makes browsers download the card instead of rendering it.
  await uploadObject(key, data, contentType);
  urls.push(`${PUBLIC_BASE}/${key}`);
  console.log(`Uploaded ${name} -> ${urls.at(-1)}`);
}

await purgeCache({ files: urls });
console.log(`Purged cache for ${urls.length} URLs`);
