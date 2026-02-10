import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { env } from "../env";
import type { ImageStorage } from "./types";

export class R2ImageStorage implements ImageStorage {
  private client: S3Client | null = null;

  private getClient(): S3Client {
    if (!this.client) {
      this.client = new S3Client({
        region: "auto",
        endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID!,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
        },
      });
    }
    return this.client;
  }

  async upload(id: string, buffer: Buffer): Promise<string> {
    const filename = `${id}.png`;
    const client = this.getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: filename,
        Body: buffer,
        ContentType: "image/png",
        CacheControl: "no-cache",
      })
    );
    return `${env.R2_PUBLIC_URL}/${filename}`;
  }

  async get(id: string): Promise<Buffer | null> {
    const filename = `${id}.png`;
    try {
      const client = this.getClient();
      const response = await client.send(
        new GetObjectCommand({
          Bucket: env.R2_BUCKET_NAME,
          Key: filename,
        })
      );
      if (!response.Body) return null;
      const bytes = await response.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch {
      return null;
    }
  }

  getUrl(id: string): string {
    return `${env.R2_PUBLIC_URL}/${id}.png`;
  }

  async delete(id: string): Promise<void> {
    const filename = `${id}.png`;
    const client = this.getClient();
    await client.send(
      new DeleteObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: filename,
      })
    );
  }
}
