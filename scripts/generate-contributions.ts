import fs from 'node:fs/promises';
import path from 'node:path';
const filename = import.meta.filename as string;
const dirname = path.dirname(filename);
import { compileLayout, renderSVG, renderPNG } from '@kuriyona/svg-toolkit';
import type { LayoutDefinition, LayoutNode, OutputDocument, OutputRect } from '@kuriyona/svg-toolkit';
import { graphql, rest } from './github.ts';

const WIDTH = 1280;
const PADDING = 48;
const INNER = WIDTH - PADDING * 2;

const ColorBG = '#f0f0f0';
const ColorText = '#000000';
const ColorMuted = '#5c5c5c';
const ColorPrimary = '#b366ff';
const ColorOther = '#c9c9c9';

const FONT_FAMILY = 'Maple Mono';
// svg-toolkit does not measure text; Maple Mono advances 0.6em per glyph.
const CHAR_WIDTH = 0.6;
const textWidth = (content: string, fontSize: number) => content.length * fontSize * CHAR_WIDTH;

const TITLE_FONT_SIZE = 56;
const TITLE_HEIGHT = Math.round(TITLE_FONT_SIZE * 1.05);
const SUBTITLE_FONT_SIZE = 22;
const SUBTITLE_HEIGHT = Math.ceil(SUBTITLE_FONT_SIZE * 1.3);
const HEADER_HEIGHT = TITLE_HEIGHT + SUBTITLE_HEIGHT;

const SECTION_FONT_SIZE = 26;
const SECTION_TITLE_HEIGHT = Math.ceil(SECTION_FONT_SIZE * 1.25);
const ROW_FONT_SIZE = 20;
const ROW_HEIGHT = 34;
const LABEL_FONT_SIZE = 16;
const LABEL_HEIGHT = 22;

const BAR_HEIGHT = 24;
const BAR_GAP = 14;
const BAR_AREA = BAR_GAP + BAR_HEIGHT + 14;
const SEGMENT_GAP = 4;
const SWATCH = 14;
const SWATCH_SPACE = 26;
const BLOCK_GAP = 8;
const BLOCK_WIDTH = (INNER - BLOCK_GAP * 11) / 12;
const TIME_BAR_AREA = BAR_GAP + BAR_HEIGHT + 10;
const SECTION_GAP = 56;
const TOP_N = 5;
const TIMEZONE_OFFSET_HOURS = 8;

const font = { loadSystemFonts: true, defaultFontFamily: FONT_FAMILY };

type RepoCount = { repository: { nameWithOwner: string }; contributions: { totalCount: number } };
type Viewer = {
  viewer: {
    login: string;
    contributionsCollection: {
      totalCommitContributions: number;
      totalIssueContributions: number;
      totalPullRequestContributions: number;
      totalPullRequestReviewContributions: number;
      restrictedContributionsCount: number;
      commitContributionsByRepository: RepoCount[];
      issueContributionsByRepository: RepoCount[];
      pullRequestContributionsByRepository: RepoCount[];
      pullRequestReviewContributionsByRepository: RepoCount[];
    };
  };
};

type Row = { label: string; value: number; share: number; color: string; detail?: string };

const CONTRIBUTIONS_QUERY = `
query ($from: DateTime!) {
  viewer {
    login
    contributionsCollection(from: $from) {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      restrictedContributionsCount
      commitContributionsByRepository(maxRepositories: 100) {
        repository { nameWithOwner }
        contributions { totalCount }
      }
      issueContributionsByRepository(maxRepositories: 100) {
        repository { nameWithOwner }
        contributions { totalCount }
      }
      pullRequestContributionsByRepository(maxRepositories: 100) {
        repository { nameWithOwner }
        contributions { totalCount }
      }
      pullRequestReviewContributionsByRepository(maxRepositories: 100) {
        repository { nameWithOwner }
        contributions { totalCount }
      }
    }
  }
}`;

// Pinned to a UTC midnight so the request key (and therefore the cache) is stable
// for the whole day.
const since = `${new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}T00:00:00Z`;
const { viewer } = await graphql<Viewer>(CONTRIBUTIONS_QUERY, { from: since });
const collection = viewer.contributionsCollection;

// One contribution count per repository, whatever the kind.
const repoContributions = new Map<string, number>();
for (const list of [
  collection.commitContributionsByRepository,
  collection.issueContributionsByRepository,
  collection.pullRequestContributionsByRepository,
  collection.pullRequestReviewContributionsByRepository,
]) {
  for (const { repository, contributions } of list) {
    repoContributions.set(
      repository.nameWithOwner,
      (repoContributions.get(repository.nameWithOwner) ?? 0) + contributions.totalCount,
    );
  }
}

// The profile's own total: kind totals include commits that the per-repository
// breakdown leaves out, so it is the only denominator that keeps the sections
// consistent with github.com.
const totalContributions =
  collection.totalCommitContributions +
  collection.totalIssueContributions +
  collection.totalPullRequestContributions +
  collection.totalPullRequestReviewContributions +
  collection.restrictedContributionsCount;

const hex = (value: string) => [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16));
const toHex = (channels: number[]) =>
  `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
const mix = (from: string, to: string, amount: number) => {
  const source = hex(from);
  const target = hex(to);
  return toHex(source.map((channel, index) => channel + (target[index] - channel) * amount));
};
// Series colors run from ColorPrimary to a pale tint, so the largest slice reads darkest.
const seriesColor = (index: number, count: number) =>
  mix(ColorPrimary, '#ffffff', count < 2 ? 0 : (index / (count - 1)) * 0.62);

const sharesToRows = (
  entries: { label: string; value: number }[],
  total: number,
  color: (index: number, count: number) => string,
): Row[] =>
  entries.map((entry, index) => ({
    ...entry,
    share: total > 0 ? (entry.value / total) * 100 : 0,
    color: color(index, entries.length),
  }));


// 1. Repositories: top N by contribution count plus an aggregate remainder.
const repoEntries = [...repoContributions.entries()]
  .map(([label, value]) => ({ label, value }))
  .sort((a, b) => b.value - a.value);
const topRepos = repoEntries.slice(0, TOP_N);
const topRepoTotal = topRepos.reduce((sum, entry) => sum + entry.value, 0);
const repoRows = sharesToRows(topRepos, totalContributions, seriesColor);
if (totalContributions - topRepoTotal > 0) {
  repoRows.push({
    label: 'Others',
    value: totalContributions - topRepoTotal,
    share: ((totalContributions - topRepoTotal) / totalContributions) * 100,
    color: ColorOther,
  });
}

// 2. Contribution kinds.
const typeEntries = [
  { label: 'Commits', value: collection.totalCommitContributions },
  { label: 'Pull requests', value: collection.totalPullRequestContributions },
  { label: 'Issues', value: collection.totalIssueContributions },
  { label: 'Reviews', value: collection.totalPullRequestReviewContributions },
].filter((entry) => entry.value > 0);
const typeRows = sharesToRows(typeEntries, totalContributions, seriesColor);

// 3. Languages, weighting each repository's byte breakdown by how much was contributed there.
const languageBytes = new Map<string, number>();
for (const [nameWithOwner, weight] of repoContributions) {
  const languages = await rest<Record<string, number>>(`/repos/${nameWithOwner}/languages`);
  for (const [language, bytes] of Object.entries(languages)) {
    languageBytes.set(language, (languageBytes.get(language) ?? 0) + bytes * weight);
  }
}
const languageEntries = [...languageBytes.entries()]
  .map(([label, value]) => ({ label, value }))
  .sort((a, b) => b.value - a.value);
const topLanguages = languageEntries.slice(0, TOP_N);
const languageTotal = languageEntries.reduce((sum, entry) => sum + entry.value, 0);
const topLanguageTotal = topLanguages.reduce((sum, entry) => sum + entry.value, 0);
const languageRows = sharesToRows(topLanguages, languageTotal, seriesColor);
if (languageTotal - topLanguageTotal > 0) {
  languageRows.push({
    label: 'Others',
    value: languageTotal - topLanguageTotal,
    share: ((languageTotal - topLanguageTotal) / languageTotal) * 100,
    color: ColorOther,
  });
}
for (const row of languageRows) {
  row.detail = `${row.share.toFixed(1)}%`;
}

// 4. Time of day: commit timestamps bucketed into 2-hour slots local to UTC+8.
const commitDates: string[] = [];
for (const { repository, contributions } of collection.commitContributionsByRepository) {
  if (contributions.totalCount === 0) {
    continue;
  }
  const nameWithOwner = repository.nameWithOwner;
  for (let page = 1; ; page++) {
    const commits = await rest<{ commit: { author: { date: string } | null } }[]>(
      `/repos/${nameWithOwner}/commits?author=${viewer.login}&since=${since}&per_page=100&page=${page}`,
    );
    for (const { commit } of commits) {
      if (commit.author) {
        commitDates.push(commit.author.date);
      }
    }
    if (commits.length < 100) {
      break;
    }
  }
}

// Slot 0 is 23:00-01:00, then 01:00-03:00 ... 21:00-23:00.
const slotOf = (date: string) => {
  const shifted = new Date(new Date(date).getTime() + TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000);
  return ((shifted.getUTCHours() + 1) % 24) >> 1;
};
const slotCounts = Array.from({ length: 12 }, () => 0);
for (const date of commitDates) {
  slotCounts[slotOf(date)] += 1;
}
const slotLabels = slotCounts.map((_, index) => {
  const start = index === 0 ? 23 : index * 2 - 1;
  return `${start}-${(start + 2) % 24}`;
});
const busiestSlot = Math.max(...slotCounts);

const header = {
  flexDirection: 'row' as const,
  justifyContent: 'space-between' as const,
  height: HEADER_HEIGHT,
  children: [
    {
      flexDirection: 'column' as const,
      children: [
        {
          type: 'text' as const,
          content: 'Contributions',
          fontSize: TITLE_FONT_SIZE,
          height: TITLE_HEIGHT,
          width: textWidth('Contributions', TITLE_FONT_SIZE),
        },
        {
          type: 'text' as const,
          content: 'Last 12 months on GitHub',
          fontSize: SUBTITLE_FONT_SIZE,
          height: SUBTITLE_HEIGHT,
          width: textWidth('Last 12 months on GitHub', SUBTITLE_FONT_SIZE),
          color: ColorMuted,
        },
      ],
    },
    {
      type: 'text' as const,
      content: `${totalContributions} contributions`,
      fontSize: SECTION_FONT_SIZE,
      height: HEADER_HEIGHT,
      width: textWidth(`${totalContributions} contributions`, SECTION_FONT_SIZE),
    },
  ],
};

const rowNode = (row: Row): LayoutNode => ({
  flexDirection: 'row',
  height: ROW_HEIGHT,
  children: [
    { width: SWATCH_SPACE, height: ROW_HEIGHT },
    {
      type: 'text',
      content: row.label,
      fontSize: ROW_FONT_SIZE,
      height: ROW_HEIGHT,
      width: textWidth(row.label, ROW_FONT_SIZE),
    },
    { flexGrow: 1 },
    {
      type: 'text',
      content: row.detail ?? `${row.share.toFixed(1)}%  ${row.value}`,
      fontSize: ROW_FONT_SIZE,
      height: ROW_HEIGHT,
      width: textWidth(row.detail ?? `${row.share.toFixed(1)}%  ${row.value}`, ROW_FONT_SIZE),
      color: ColorMuted,
    },
  ],
});

const section = (title: string, rows: Row[]): LayoutNode => ({
  children: [
    {
      type: 'text',
      content: title,
      fontSize: SECTION_FONT_SIZE,
      height: SECTION_TITLE_HEIGHT,
      width: textWidth(title, SECTION_FONT_SIZE),
    },
    { height: BAR_AREA },
    ...rows.map(rowNode),
  ],
});

const timeSection: LayoutNode = {
  children: [
    {
      type: 'text',
      content: 'Time of day (UTC+8)',
      fontSize: SECTION_FONT_SIZE,
      height: SECTION_TITLE_HEIGHT,
      width: textWidth('Time of day (UTC+8)', SECTION_FONT_SIZE),
    },
    { height: TIME_BAR_AREA },
    {
      flexDirection: 'row',
      gap: BLOCK_GAP,
      height: LABEL_HEIGHT,
      children: slotLabels.map((label) => ({
        width: BLOCK_WIDTH,
        height: LABEL_HEIGHT,
        children: [
          {
            type: 'text',
            content: label,
            fontSize: LABEL_FONT_SIZE,
            height: LABEL_HEIGHT,
            width: textWidth(label, LABEL_FONT_SIZE),
            color: ColorMuted,
          },
        ],
      })),
    },
  ],
};

// The canvas height is the sum of the blocks: nothing is stretched to fill it.
const sectionHeight = (rows: number) => SECTION_TITLE_HEIGHT + BAR_AREA + rows * ROW_HEIGHT;
const timeHeight = SECTION_TITLE_HEIGHT + TIME_BAR_AREA + LABEL_HEIGHT;
const HEIGHT =
  PADDING * 2 +
  HEADER_HEIGHT +
  SECTION_GAP * 4 +
  sectionHeight(repoRows.length) +
  sectionHeight(typeRows.length) +
  sectionHeight(languageRows.length) +
  timeHeight;

const layout: LayoutDefinition = {
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: ColorBG,
  color: ColorText,
  font,
  fontSize: ROW_FONT_SIZE,
  padding: PADDING,
  gap: SECTION_GAP,
  flexDirection: 'column',
  children: [
    header,
    section('Most active repositories', repoRows),
    section('Contribution types', typeRows),
    section('Languages', languageRows),
    timeSection,
  ],
};

const doc = compileLayout(layout);

const rect = (x: number, y: number, width: number, height: number, fill: string): OutputRect => ({
  type: 'rect',
  x,
  y,
  width,
  height,
  fill,
});

const findText = (content: string) => {
  const element = doc.elements.find((item) => item.type === 'text' && item.content === content);
  if (!element) {
    throw new Error(`No text element for ${content}`);
  }
  return element;
};

// Bars are geometry the toolkit cannot express, so they are appended to the
// compiled elements. Their vertical anchor comes from the section title the
// layout already positioned.
const drawBar = (title: string, rows: Row[]) => {
  const anchor = findText(title);
  const y = anchor.y + anchor.height + BAR_GAP;
  const shareTotal = rows.reduce((sum, row) => sum + row.share, 0);
  let x = PADDING;
  for (const [index, row] of rows.entries()) {
    const width = index === rows.length - 1 ? PADDING + INNER - x : (INNER * row.share) / shareTotal;
    doc.elements.push(
      rect(x, y, Math.max(width - SEGMENT_GAP, 0), BAR_HEIGHT, row.color),
    );
    x += width;
  }
  // Legend rows start right below the reserved bar area; the swatch sits in each
  // row's leading spacer, so it is positioned from the same rhythm.
  const rowsTop = anchor.y + anchor.height + BAR_AREA;
  for (let index = 0; index < rows.length; index++) {
    doc.elements.push(
      rect(
        PADDING + 4,
        rowsTop + index * ROW_HEIGHT + (ROW_HEIGHT - SWATCH) / 2,
        SWATCH,
        SWATCH,
        rows[index].color,
      ),
    );
  }
};

drawBar('Most active repositories', repoRows);
drawBar('Contribution types', typeRows);
drawBar('Languages', languageRows);

// Time blocks: fixed width, color depth proportional to each slot's share of the busiest one.
const timeAnchor = findText('Time of day (UTC+8)');
const timeY = timeAnchor.y + timeAnchor.height + BAR_GAP;
for (const [index, count] of slotCounts.entries()) {
  const intensity = busiestSlot > 0 ? count / busiestSlot : 0;
  doc.elements.push(
    rect(
      PADDING + index * (BLOCK_WIDTH + BLOCK_GAP),
      timeY,
      BLOCK_WIDTH,
      BAR_HEIGHT,
      mix(ColorPrimary, '#ffffff', 0.85 * (1 - intensity)),
    ),
  );
}

const svg = renderSVG(doc);
const png = await renderPNG(svg, font);

const outDir = path.join(dirname, '..', '.cache');
await fs.mkdir(outDir, { recursive: true });
const svgPath = path.join(outDir, 'contributions.svg');
const pngPath = path.join(outDir, 'contributions.png');
await fs.writeFile(svgPath, svg);
await fs.writeFile(pngPath, png);

console.log(
  `${totalContributions} contributions across ${repoContributions.size} repositories; ${commitDates.length} commit timestamps bucketed`,
);
console.log(`SVG: ${svgPath}`);
console.log(`PNG: ${pngPath}`);
