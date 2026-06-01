import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const region = required("S3_REGION");
const endpoint = required("S3_ENDPOINT");
const accessKeyId = required("S3_ACCESS_KEY");
const secretAccessKey = required("S3_SECRET_KEY");

export const PUBLIC_BUCKET = required("S3_PUBLIC_BUCKET");
export const PRIVATE_BUCKET = required("S3_PRIVATE_BUCKET");

// Base URL public objects are served from. For Linode, this is
// https://<bucket>.<region>.linodeobjects.com.
export const PUBLIC_BASE_URL = required("S3_PUBLIC_BASE_URL").replace(/\/$/, "");

const PRIVATE_URL_PREFIX = "/api/storage/private/";

let cachedClient: S3Client | null = null;
function client(): S3Client {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  return cachedClient;
}

export interface UploadInput {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
}

/** Upload to the public bucket. Returns a directly-servable URL. */
export async function uploadPublic(input: UploadInput): Promise<string> {
  await client().send(
    new PutObjectCommand({
      Bucket: PUBLIC_BUCKET,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      ACL: "public-read",
    })
  );
  return `${PUBLIC_BASE_URL}/${input.key}`;
}

/** Upload to the private bucket. Returns an API-relative path that the
 *  frontend can use as an `<img>` / `<a>` src; the storage route will
 *  redirect to a fresh signed URL on each request. */
export async function uploadPrivate(input: UploadInput): Promise<string> {
  await client().send(
    new PutObjectCommand({
      Bucket: PRIVATE_BUCKET,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    })
  );
  return `${PRIVATE_URL_PREFIX}${input.key}`;
}

/** Pre-signed GET for a private object — used to redirect from the API
 *  route to the underlying storage directly. */
export async function getSignedDownloadUrl(
  key: string,
  expiresSeconds = 60 * 60
): Promise<string> {
  return await getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: PRIVATE_BUCKET, Key: key }),
    { expiresIn: expiresSeconds }
  );
}

/** Pre-signed PUT — lets the browser upload directly to the bucket
 *  without proxying through the API. */
export async function getSignedUploadUrl(input: {
  key: string;
  contentType: string;
  visibility: "public" | "private";
  expiresSeconds?: number;
}): Promise<{ uploadURL: string; objectPath: string }> {
  const bucket = input.visibility === "public" ? PUBLIC_BUCKET : PRIVATE_BUCKET;
  const uploadURL = await getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      ContentType: input.contentType,
      ...(input.visibility === "public" ? { ACL: "public-read" as const } : {}),
    }),
    { expiresIn: input.expiresSeconds ?? 15 * 60 }
  );
  const objectPath =
    input.visibility === "public"
      ? `${PUBLIC_BASE_URL}/${input.key}`
      : `${PRIVATE_URL_PREFIX}${input.key}`;
  return { uploadURL, objectPath };
}

/** Best-effort delete that handles both public-URL and private-path forms.
 *  Legacy paths (/objects/..., /api/uploads/image/..., GCS URLs) are ignored. */
export async function tryDeleteByStoredPath(storedPath: string): Promise<void> {
  if (!storedPath) return;
  try {
    if (storedPath.startsWith(PUBLIC_BASE_URL + "/")) {
      const key = storedPath.slice(PUBLIC_BASE_URL.length + 1);
      await client().send(
        new DeleteObjectCommand({ Bucket: PUBLIC_BUCKET, Key: key })
      );
    } else if (storedPath.startsWith(PRIVATE_URL_PREFIX)) {
      const key = storedPath.slice(PRIVATE_URL_PREFIX.length);
      await client().send(
        new DeleteObjectCommand({ Bucket: PRIVATE_BUCKET, Key: key })
      );
    }
  } catch {
    // Best-effort — caller doesn't need to know.
  }
}

/** Parse a stored private path back into its key, or null if not a
 *  private-bucket reference. Used by the storage route to sign on demand. */
export function privateKeyFromPath(storedPath: string): string | null {
  if (!storedPath.startsWith(PRIVATE_URL_PREFIX)) return null;
  return storedPath.slice(PRIVATE_URL_PREFIX.length);
}
