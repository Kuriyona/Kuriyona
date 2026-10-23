import fs from 'node:fs/promises';
import path from 'node:path';
const filename = import.meta.filename as string;
const dirname = path.dirname(filename);
import { compileLayout, renderSVG, renderPNG } from '@kuriyona/svg-toolkit';
import type { LayoutDefinition } from '@kuriyona/svg-toolkit';
import { loadFont } from './font.ts';

const WIDTH = 1280;
const HEIGHT = 320;
const PADDING = 48;
const ColorBG = '#f0f0f0';
const ColorText = '#000000';
const ColorPrimary = '#b366ff';

// svg-toolkit does not measure text: a text node collapses to zero width unless
// given an explicit one. Maple Mono advances 0.6em per glyph, so a row's width is
// `content.length * fontSize * 0.6` — this is what keeps the split title and the
// two footer ends from overlapping.
const CHAR_WIDTH = 0.6;

const TITLE_PREFIX = "I'm ";
const TITLE_NAME = 'Kuriyona';
const TITLE_FONT_SIZE = 96;
const TITLE_HEIGHT = Math.round(TITLE_FONT_SIZE * 1.05);

const SUBTITLE = 'An interest-driven developer · Student · Transgender';
const SUBTITLE_FONT_SIZE = 32;

const FOOTER_LABEL = 'Read more on';
const FOOTER_LINK = 'https://Kuriyona.com -->';
const FOOTER_FONT_SIZE = 20;

const font = await loadFont();

const layout: LayoutDefinition = {
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: ColorBG,
  color: ColorText,
  font,
  fontSize: FOOTER_FONT_SIZE,
  padding: PADDING,
  flexDirection: 'column',
  children: [
    {
      flexDirection: 'row',
      height: TITLE_HEIGHT,
      children: [
        {
          type: 'text',
          content: TITLE_PREFIX,
          fontSize: TITLE_FONT_SIZE,
          width: TITLE_PREFIX.length * TITLE_FONT_SIZE * CHAR_WIDTH,
          height: TITLE_HEIGHT,
        },
        {
          type: 'text',
          content: TITLE_NAME,
          fontSize: TITLE_FONT_SIZE,
          color: ColorPrimary,
          width: TITLE_NAME.length * TITLE_FONT_SIZE * CHAR_WIDTH,
          height: TITLE_HEIGHT,
        },
      ],
    },
    {
      type: 'text',
      content: SUBTITLE,
      fontSize: SUBTITLE_FONT_SIZE,
      width: SUBTITLE.length * SUBTITLE_FONT_SIZE * CHAR_WIDTH,
      height: Math.ceil(SUBTITLE_FONT_SIZE * 1.2),
    },
    // Pushes the footer row to the bottom while the header block stays glued to the top.
    { flexGrow: 1 },
    {
      flexDirection: 'row',
      justifyContent: 'space-between',
      children: [
        {
          type: 'text',
          content: FOOTER_LABEL,
          width: FOOTER_LABEL.length * FOOTER_FONT_SIZE * CHAR_WIDTH,
          height: Math.ceil(FOOTER_FONT_SIZE * 1.2),
        },
        {
          type: 'text',
          content: FOOTER_LINK,
          width: FOOTER_LINK.length * FOOTER_FONT_SIZE * CHAR_WIDTH,
          height: Math.ceil(FOOTER_FONT_SIZE * 1.2),
        },
      ],
    },
  ],
};

const doc = compileLayout(layout);
const svg = renderSVG(doc);
const png = await renderPNG(svg, font);

const outDir = path.join(dirname, '..', '.cache');
await fs.mkdir(outDir, { recursive: true });
const svgPath = path.join(outDir, 'intro.svg');
const pngPath = path.join(outDir, 'intro.png');
await fs.writeFile(svgPath, svg);
await fs.writeFile(pngPath, png);

console.log(`SVG: ${svgPath}`);
console.log(`PNG: ${pngPath}`);
