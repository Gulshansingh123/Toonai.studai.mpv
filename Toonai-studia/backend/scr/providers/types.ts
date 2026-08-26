/**
 * Provider interfaces. Real vendor SDKs/HTTP calls are implemented behind these
 * so we can swap AI vendors without touching route/job code.
 *
 * IMPORTANT: If a concrete provider is not configured (missing API key/base URL),
 * it must throw ProviderNotConfiguredError — routes surface this as a clear
 * "AI provider not configured" error to the user. We never fabricate a fake
 * video/audio/subtitle result.
 */

export class ProviderNotConfiguredError extends Error {
  constructor(providerName: string) {
    super(`${providerName} is not configured. Set the required environment variables (see .env.example).`);
    this.name = "ProviderNotConfiguredError";
  }
}

export interface TextToVideoRequest {
  prompt: string;
  durationSec: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  style: string;
  camera: string;
  quality: "standard" | "hd" | "fullhd";
}

export interface ImageToVideoRequest {
  imageUrl: string; // pre-uploaded to storage; provider fetches via signed URL
  prompt: string;
  durationSec: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
}

export interface VideoGenerationResult {
  providerJobId: string;
  status: "processing" | "completed" | "failed";
  videoUrl?: string; // set once completed
  errorMessage?: string;
}

export interface VideoProvider {
  generate(req: TextToVideoRequest): Promise<VideoGenerationResult>;
  getStatus(providerJobId: string): Promise<VideoGenerationResult>;
}

export interface ImageToVideoProvider {
  generate(req: ImageToVideoRequest): Promise<VideoGenerationResult>;
  getStatus(providerJobId: string): Promise<VideoGenerationResult>;
}

export interface StoryScene {
  order: number;
  prompt: string;
  durationSec: number;
  character?: string;
  background?: string;
  camera?: string;
  dialogue?: string;
}

export interface StoryResult {
  title: string;
  synopsis: string;
  characters: { name: string; description: string }[];
  scenes: StoryScene[];
}

export interface TextProvider {
  generateStory(prompt: string): Promise<StoryResult>;
}

export interface VoiceRequest {
  text: string;
  language: "hindi" | "english" | "hinglish" | string;
  voiceStyle: "male" | "female" | "narrator" | "energetic" | "calm" | "cartoon";
}

export interface VoiceResult {
  audioUrl: string;
  durationSec: number;
}

export interface VoiceProvider {
  synthesize(req: VoiceRequest): Promise<VoiceResult>;
  listVoices(): Promise<{ id: string; label: string; language: string; style: string; previewUrl: string }[]>;
}

export interface StorageProvider {
  putObject(key: string, body: Buffer, contentType: string): Promise<string>; // returns object key
  getSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  getSignedUploadUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
}
