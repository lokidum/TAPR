import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let _s3: S3Client | null = null;

function getS3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-southeast-2' });
  }
  return _s3;
}

function getBucket(): string {
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  if (!bucket) throw new Error('AWS_S3_BUCKET_NAME is not configured');
  return bucket;
}

// ── Presigned upload URL (PUT) — 5-minute expiry ──────────────────────────────

export async function generateUploadPresignedUrl(
  key: string,
  mimeType: string,
  _maxSizeMb: number   // enforced client-side; passed for future policy use
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: mimeType,
  });
  return getSignedUrl(getS3(), command, { expiresIn: 300 });
}

// ── CloudFront download URL (does not expire) ─────────────────────────────────

export function generateDownloadUrl(key: string): string {
  const domain = process.env.CLOUDFRONT_DOMAIN;
  if (!domain) throw new Error('CLOUDFRONT_DOMAIN is not configured');
  return `https://${domain}/${key}`;
}

// ── Check whether an object exists in S3 ─────────────────────────────────────

export async function objectExists(key: string): Promise<boolean> {
  try {
    await getS3().send(new HeadObjectCommand({ Bucket: getBucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}

// ── Hard-delete an object from S3 ────────────────────────────────────────────

export async function deleteObject(key: string): Promise<void> {
  await getS3().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

// ── Upload buffer to S3 ──────────────────────────────────────────────────────

export async function uploadBuffer(
  key: string,
  buffer: Buffer,
  contentType = 'application/pdf'
): Promise<void> {
  await getS3().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
}
