import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import type { Readable } from "stream";

// S3 client uses BACKEND_S3_ACCESS_KEY_ID / BACKEND_S3_SECRET_ACCESS_KEY — the names
// written by deploy.yml. The AWS SDK's default credential chain reads AWS_ACCESS_KEY_ID
// which is never set on the Lightsail instance, causing AccessDenied on every upload.
const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.BACKEND_S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.BACKEND_S3_SECRET_ACCESS_KEY ?? "",
  },
});

const BUCKET = process.env.AWS_UPLOADS_BUCKET ?? "";

/**
 * Upload a file buffer to S3.
 * Multer must use memoryStorage so file.buffer is populated before this is called.
 * Returns the S3 object key: "<folder>/<timestamp>-<originalname>"
 */
export async function uploadToS3(
  folder: "cv" | "linkedin",
  file: Express.Multer.File
): Promise<string> {
  const key = `${folder}/${Date.now()}-${file.originalname}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );

  return key;
}

/**
 * Stream an S3 object back to a Node.js Readable stream.
 * Used by getCandidateFileHandler to pipe binary file content to the response.
 * Throws on NoSuchKey or any other S3 error — caller maps to 404/502 as appropriate.
 */
export async function getS3Stream(key: string): Promise<NodeJS.ReadableStream> {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );

  return response.Body as Readable;
}

/**
 * Download an S3 object fully into a Buffer.
 * Used by screening.service.ts to pass PDF/text content to the parser without
 * writing a temp file to disk.
 * Throws on NoSuchKey or any other S3 error.
 */
export async function getS3Buffer(key: string): Promise<Buffer> {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );

  const stream = response.Body as Readable;

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
