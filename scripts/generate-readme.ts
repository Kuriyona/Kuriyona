import fs from 'node:fs/promises';
import path from 'node:path';
const filename = import.meta.filename as string;
const dirname = path.dirname(filename);
import { publicUrl } from './cdn.ts';

const SITE = 'https://Kuriyona.com';
const README_PATH = path.join(dirname, '..', 'README.md');
const CARD_WIDTH = 1280;

// Both cards are the published PNGs; the intro is the clickable entry point.
const readme = `<div align="center">

<a href="${SITE}">
  <img alt="Kuriyona" src="${publicUrl('intro.png')}" width="${CARD_WIDTH}">
</a>

<img alt="Contributions" src="${publicUrl('contributions.png')}" width="${CARD_WIDTH}">

</div>
`;

await fs.writeFile(README_PATH, readme);
console.log(`README: ${README_PATH}`);
