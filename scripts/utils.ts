import { AwsClient } from 'aws4fetch';
import Cloudflare from 'cloudflare';

const endpoint = process.env.S3_ENDPOINT!;
const bucket = process.env.BUCKET_NAME!;

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
  const response = await s3.fetch(`${endpoint}/${bucket}/${key}`, {
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
