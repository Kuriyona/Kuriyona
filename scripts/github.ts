import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
const filename = import.meta.filename as string;
const dirname = path.dirname(filename);

const API = 'https://api.github.com';
const CACHE_DIR = path.join(dirname, '..', '.cache', 'github');
const refresh = process.argv.includes('--refresh');

const token = process.env.GITHUB_API_TOKEN ?? process.env.GITHUB_TOKEN;
if (!token) {
  throw new Error('GITHUB_API_TOKEN is missing; add it to .env');
}

const authHeaders = { Authorization: `bearer ${token}` };

const fetchJson = async (url: string, init: RequestInit) => {
  const response = await fetch(url, init);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${url} failed (${response.status}): ${body}`);
  }
  return JSON.parse(body);
};

// Every response is cached under a hash of its request, so iterating on the card
// costs no quota. `--refresh` ignores the cache and overwrites it.
const cached = async (key: string, url: string, init: RequestInit) => {
  const file = path.join(CACHE_DIR, `${crypto.createHash('sha1').update(key).digest('hex')}.json`);
  const hit = refresh ? null : await fs.readFile(file, 'utf8').catch(() => null);
  if (hit) {
    return JSON.parse(hit);
  }
  const body = await fetchJson(url, init);
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(body, null, 2));
  return body;
};

export const graphql = async <T>(query: string, variables: Record<string, unknown> = {}) => {
  const body = await cached(`graphql ${query} ${JSON.stringify(variables)}`, `${API}/graphql`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (body.errors) {
    throw new Error(`GraphQL: ${JSON.stringify(body.errors)}`);
  }
  return body.data as T;
};

export const rest = <T>(pathname: string) =>
  cached(`rest ${pathname}`, `${API}${pathname}`, { headers: authHeaders }) as Promise<T>;
