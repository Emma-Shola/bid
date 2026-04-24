import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const uploadsRoot = path.join(process.cwd(), "public", "uploads", "resumes");
const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp"
]);
const allowedExtensions = new Set([".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg", ".webp"]);
const maxFileSizeBytes = 5 * 1024 * 1024;

const s3Config =
  process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? {
        bucket: process.env.S3_BUCKET,
        region: process.env.S3_REGION ?? "auto",
        endpoint: process.env.S3_ENDPOINT,
        publicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? null,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true"
      }
    : null;

let s3Client: S3Client | null = null;

function getS3Client() {
  if (!s3Config) {
    return null;
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: s3Config.region,
      endpoint: s3Config.endpoint || undefined,
      forcePathStyle: s3Config.forcePathStyle,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? ""
      }
    });
  }

  return s3Client;
}

export function isAllowedResumeMimeType(mimeType: string) {
  return allowedMimeTypes.has(mimeType);
}

export function isAllowedResumeExtension(fileName: string) {
  return allowedExtensions.has(path.extname(fileName).toLowerCase());
}

export function validateResumeFile(fileName: string, mimeType: string, size: number) {
  const normalizedMimeType = (mimeType ?? "").toLowerCase().trim();
  const mimeAllowed = normalizedMimeType ? isAllowedResumeMimeType(normalizedMimeType) : false;
  const extensionAllowed = isAllowedResumeExtension(fileName);

  if (!mimeAllowed && !extensionAllowed) {
    return "Unsupported file type";
  }

  if (size <= 0) {
    return "File is empty";
  }

  if (size > maxFileSizeBytes) {
    return "File must be 5MB or smaller";
  }

  return null;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildStorageKey(input: { userId: string; fileName: string }) {
  const safeName = sanitizeFileName(input.fileName);
  return `${input.userId}/${Date.now()}-${safeName}`;
}

export async function saveResumeFile(input: {
  userId: string;
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
}) {
  const key = buildStorageKey(input);
  const body = Buffer.from(input.bytes);

  const client = getS3Client();
  if (client && s3Config) {
    await client.send(
      new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: key,
        Body: body,
        ContentType: input.mimeType
      })
    );

    const url = s3Config.publicBaseUrl
      ? `${s3Config.publicBaseUrl.replace(/\/$/, "")}/${key}`
      : s3Config.endpoint
        ? `${s3Config.endpoint.replace(/\/$/, "")}/${s3Config.bucket}/${key}`
        : `https://${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com/${key}`;

    return {
      fileName: key,
      mimeType: input.mimeType,
      url
    };
  }

  await mkdir(uploadsRoot, { recursive: true });
  const relativeUrl = `/uploads/resumes/${key}`;
  const destination = path.join(uploadsRoot, key);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, body);

  return {
    fileName: key,
    mimeType: input.mimeType,
    url: relativeUrl
  };
}
