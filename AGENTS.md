# Repository Guidelines

## Project Overview

Personal profile-card generator for Kuriyona. One script renders a 1280×320 "intro card" from a declarative layout, another renders a 1280-wide contributions card (height follows its content) from GitHub data, and a third uploads every generated card to Cloudflare R2 and purges the CDN cache for `r2.kuriyona.com`. There is no application, library entry point, or UI — only standalone TypeScript scripts run directly by Node.

## Architecture & Data Flow

```
scripts/generate-intro.ts   LayoutDefinition → compileLayout → renderSVG → renderPNG
                            → .cache/intro.svg + .cache/intro.png
scripts/generate-contributions.ts
                            GitHub GraphQL + REST → .cache/contributions.{svg,png}

scripts/upload.ts           reads .cache/{intro,contributions}.{svg,png}
                            → uploadObject()  SigV4 PUT to R2 S3 API (aws4fetch)
                            → purgeCache()    Cloudflare REST API (cloudflare SDK)

scripts/generate-readme.ts  publicUrl() → README.md (both cards, PNG)
scripts/font.ts             downloads + verifies Maple Mono TTF → .cache/fonts
```

All scripts are standalone top-level-await programs that exit non-zero on failure. `scripts/utils.ts` owns R2/Cloudflare access, `scripts/github.ts` owns GitHub access (token from `GITHUB_API_TOKEN` / `GITHUB_TOKEN`) and caches every response body under `.cache/github`; `--refresh` forces refetch. The contributions card reads each section's own normalized shares and anchors its bar geometry on the compiled section-title elements, since the layout engine cannot draw bars.

The layout is a yoga flexbox tree described as plain JSON (`LayoutDefinition`). Design constraints that the code depends on:

- **Text is not measured.** `compileLayout` gives text nodes zero size unless `width`/`height` are set explicitly, so every text node in `generate-intro.ts` computes its width as `content.length * fontSize * CHAR_WIDTH` with `CHAR_WIDTH = 0.6` (Maple Mono's advance in em). Any new text node needs the same treatment or it collapses and overlaps its neighbour.
- **Text is drawn with `dominant-baseline="hanging"`**, so a node's `y` is the top of its box; vertical rhythm comes from explicit heights (`1.2em` line box by default here).
- **`renderSVG` hardcodes `text { font-weight: bold }`** in an embedded `<style>`. Per-node weights are impossible without post-processing the SVG.
- Fonts are resolved by the rasterizer from `.cache/fonts`: `font.ts` downloads the pinned Maple Mono release (checksum-verified) and passes the Regular/Bold TTFs as `fontFiles` with `loadSystemFonts: false`, so host fonts never leak into a render and CI matches local output.
- The daily `.github/workflows/cards.yml` run renders both cards and uploads them; it needs the `GITHUB_API_TOKEN`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `BUCKET_NAME` and `CF_API_TOKEN` repo secrets.

## Key Directories

| Path     | Contents                                                                       |
| -------- | ------------------------------------------------------------------------------ |
| `scripts/` | All code: `generate-intro.ts`, `generate-contributions.ts`, `generate-readme.ts`, `upload.ts`, `github.ts`, `cdn.ts`, `font.ts`, `utils.ts` |
| `.cache/` | Gitignored output (`intro.{svg,png}`, `contributions.{svg,png}`, GitHub cache in `github/`, downloaded fonts in `fonts/`); upload reads from here |

There is no `src/`, `tests/`, or build output directory.

## Development Commands

```bash
pnpm generate-intro          # render .cache/intro.svg + .cache/intro.png
pnpm generate-contributions  # render .cache/contributions.{svg,png} from GitHub
pnpm upload                   # upload every file in the publish set, then purge those URLs
pnpm exec tsc --noEmit       # the only static check
node scripts/generate-intro.ts   # scripts run directly; no build step
```

`generate-readme` writes `README.md` at the repo root: both cards as PNGs from `r2.kuriyona.com`, the intro wrapped in a link to `Kuriyona.com`.

`.env` is loaded by `upload` and `generate-contributions` (`node --env-file-if-exists=.env`); `generate-intro` needs no environment.

## Code Conventions & Common Patterns

- **Formatting** (target style, from `.oxfmtrc.json`): 2-space indent, single quotes, semicolons, `bracketSameLine`. Note `oxfmt` is *not* installed, so nothing enforces this — match existing files by hand.
- **Imports**: Node builtins first, then the `path`/`dirname` preamble, then package imports, then relative imports. Use `import type` for types. **Relative imports must carry the `.ts` extension** (`import { purgeCache, uploadObject } from './utils.ts'`) because Node ESM does no extension resolution.
- **Path derivation**: every script starts with `import.meta.filename` → `path.dirname` and builds outputs relative to itself, never to `process.cwd()`.
- **Naming**: module constants are `SCREAMING_SNAKE`; layout/color constants use a `Color*` prefix (`ColorBG`, `ColorPrimary`); functions are `camelCase`; files are `kebab-case`.
- **Async**: top-level `await` in scripts; shared helpers are small exported `async` functions in `utils.ts`. No classes, no DI container, no state beyond module constants.
- **Errors**: no defensive `try/catch`. `uploadObject` throws with the HTTP status and response body; everything else lets Node print the stack and exit non-zero.
- Avoid one-expression helper functions — compute inline (e.g. widths are computed at the call site).

## Important Files

| File                        | Role                                                                 |
| --------------------------- | -------------------------------------------------------------------- |
| `scripts/generate-intro.ts` | Card content, colors, geometry; the only place design values live    |
| `scripts/upload.ts`         | Publish set (`FILES`), extension→content-type map, purge              |
| `scripts/cdn.ts`            | Public URL contract (`PUBLIC_BASE`, `KEY_PREFIX`, `publicUrl`) shared by upload and README |
| `scripts/generate-readme.ts`| Writes `README.md` embedding the published PNGs                        |
| `scripts/utils.ts`          | `uploadObject` (S3 SigV4) and `purgeCache` (zone id hardcoded here)   |
| `package.json`              | `"type": "module"`, npm scripts, deps                                |
| `tsconfig.json`             | `nodenext` + `strict` + `erasableSyntaxOnly` + `allowImportingTsExtensions` |
| `.gitignore`                | `node_modules`, `.cache`, `.env`                                     |
| `LICENSE`                   | WTFPL v2                                                             |

## Runtime/Tooling Preferences

- **Node 24**, native TypeScript type stripping — no `tsx`, `ts-node`, or bundler. Keep syntax erasable: no enums, parameter properties, or namespaces (`erasableSyntaxOnly` enforces this).
- **ESM everywhere** (`"type": "module"` in `package.json`); top-level await is available.
- **pnpm** (lockfile v9 committed). `.env` supplies `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `BUCKET_NAME`, `CF_API_TOKEN`, and `GITHUB_API_TOKEN` (classic PAT, `read:user` only — no repo scope); `ACCOUNT_ID` is present but unused.
- **Credentials are split by API**: the R2 API token works only against the S3 endpoint (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`), so uploads use SigV4 via `aws4fetch`. Cache purge is a REST call and needs a separate Cloudflare API token with `Zone → Cache Purge`; an R2 "Object Read & Write" token is rejected there (401).
- Unused dependency worth remembering: `ky` is declared but imported nowhere.
- Bun is intentionally not used; do not reintroduce `Bun.*` APIs, `bun` script runners, or `@types/bun`.

## Testing & QA

No test framework, no test files. CI is `.github/workflows/cards.yml`, which only renders and uploads — it runs no checks. Verification is:

1. `pnpm exec tsc --noEmit` for types.
2. `pnpm generate-intro`, then inspect `.cache/intro.svg` / `.png` — layout regressions show up as overlapping text or wrong x/width on `<text>` elements.
3. For uploads, confirm the public URL headers rather than trusting the exit code: `curl -sSI https://r2.kuriyona.com/img/readme/intro.svg` should return 200 with `Content-Type: image/svg+xml`.

Because the layout engine never measures text, reasoning alone cannot validate a change — run the generator and look at the output.
