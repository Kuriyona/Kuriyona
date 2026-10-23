import { AwsClient } from 'aws4fetch';
import Cloudflare from 'cloudflare';

// The bucket is public and belongs to a single account, so its address is not
// configuration. Credentials stay in the environment.
const ACCOUNT_ID = '62d767af804659086b9dddbba84c88ba';
const ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
const BUCKET = 'kuriyona-r2';

// R2's S3 API is region-agnostic, so `auto` is enough; aws4fetch signs with the
// account-scoped access key / secret from an R2 API token.
const s3 = new AwsClient({
  accessKeyId: process.env.ACCESS_KEY_ID!,
  secretAccessKey: process.env.SECRET_ACCESS_KEY!,
  service: 's3',
  region: 'auto',
});

const client = new Cloudflare({
  apiToken: process.env.CF_API_TOKEN,
});

export const uploadObject = async (key: string, body: Uint8Array, contentType: string) => {
  const response = await s3.fetch(`${ENDPOINT}/${BUCKET}/${key}`, {
    method: 'PUT',
    // Node's BodyInit rejects Uint8Array<ArrayBufferLike>; the bytes are a plain buffer.
    body: body as BodyInit,
    headers: { 'Content-Type': contentType },
  });
  if (!response.ok) {
    throw new Error(`Upload failed (${response.status}): ${await response.text()}`);
  }
};

export const purgeCache = async (params: { files: string[] }) => {
  await client.cache.purge({
    ...params,
    zone_id: 'd9a70ef0a143cb0897a16d6779edd1ae',
  });
};
