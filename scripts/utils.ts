import { S3Client } from 'bun';
import Cloudflare from 'cloudflare';

export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  accessKeyId: process.env.ACCESS_KEY_ID!,
  secretAccessKey: process.env.SECRET_ACCESS_KEY!,
  bucket: process.env.BUCKET_NAME!,
});

const client = new Cloudflare({
  apiToken: process.env['CLOUDFLARE_API_TOKEN'],
});

export const upload = async (file: Buffer | string, key: string) => {
  if (typeof file === 'string') {
    file = Buffer.from(file);
  }
  const s3File = s3.file(key);
  await s3File.write(file);
  await purgeCache({ files: [`https://r2.kuriyona.com/${key}`] });
};

export const purgeCache = async (params: Cloudflare.Cache.CachePurgeParams) => {
  await client.cache.purge({
    ...params,
    zone_id: 'd9a70ef0a143cb0897a16d6779edd1ae',
  });
};
