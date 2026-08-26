import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, isConfigured } from "../config/env.js";
import { ProviderNotConfiguredError, type StorageProvider } from "./types.js";

class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    if (!isConfigured(env.s3Endpoint, env.s3Region, env.s3Bucket, env.s3AccessKeyId, env.s3SecretAccessKey)) {
      throw new ProviderNotConfiguredError("StorageProvider (S3)");
    }
    this.bucket = env.s3Bucket!;
    this.client = new S3Client({
      endpoint: env.s3Endpoint,
      region: env.s3Region,
      credentials: {
        accessKeyId: env.s3AccessKeyId!,
        secretAccessKey: env.s3SecretAccessKey!,
      },
      forcePathStyle: true, // required for most non-AWS S3-compatible providers
    });
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType })
    );
    return key;
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async getSignedUploadUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

let instance: StorageProvider | null = null;
export function getStorageProvider(): StorageProvider {
  if (!instance) instance = new S3StorageProvider();
  return instance;
}
