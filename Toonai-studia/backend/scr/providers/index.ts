import { env, isConfigured } from "../config/env.js";
import {
  ProviderNotConfiguredError,
  type ImageToVideoProvider,
  type ImageToVideoRequest,
  type VideoGenerationResult,
  type TextProvider,
  type StoryResult,
  type VoiceProvider,
  type VoiceRequest,
  type VoiceResult,
} from "./types.js";

function mapStatus(vendorStatus: string): "processing" | "completed" | "failed" {
  if (["completed", "succeeded", "done"].includes(vendorStatus)) return "completed";
  if (["failed", "error"].includes(vendorStatus)) return "failed";
  return "processing";
}

class HttpImageToVideoProvider implements ImageToVideoProvider {
  private baseUrl: string;
  private apiKey: string;
  constructor() {
    if (!isConfigured(env.imageToVideoProviderApiKey, env.imageToVideoProviderBaseUrl)) {
      throw new ProviderNotConfiguredError("ImageToVideoProvider");
    }
    this.baseUrl = env.imageToVideoProviderBaseUrl!;
    this.apiKey = env.imageToVideoProviderApiKey!;
  }
  async generate(req: ImageToVideoRequest): Promise<VideoGenerationResult> {
    const res = await fetch(`${this.baseUrl}/v1/image-to-video`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: req.imageUrl,
        prompt: req.prompt,
        duration_seconds: req.durationSec,
        aspect_ratio: req.aspectRatio,
      }),
    });
    if (!res.ok) throw new Error(`ImageToVideoProvider request failed (${res.status})`);
    const data = (await res.json()) as { id: string; status: string; video_url?: string };
    return { providerJobId: data.id, status: mapStatus(data.status), videoUrl: data.video_url };
  }
  async getStatus(providerJobId: string): Promise<VideoGenerationResult> {
    const res = await fetch(`${this.baseUrl}/v1/image-to-video/${providerJobId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`ImageToVideoProvider status check failed (${res.status})`);
    const data = (await res.json()) as { id: string; status: string; video_url?: string; error?: string };
    return { providerJobId: data.id, status: mapStatus(data.status), videoUrl: data.video_url, errorMessage: data.error };
  }
}

class HttpTextProvider implements TextProvider {
  private baseUrl: string;
  private apiKey: string;
  constructor() {
    if (!isConfigured(env.textProviderApiKey, env.textProviderBaseUrl)) {
      throw new ProviderNotConfiguredError("TextProvider");
    }
    this.baseUrl = env.textProviderBaseUrl!;
    this.apiKey = env.textProviderApiKey!;
  }
  async generateStory(prompt: string): Promise<StoryResult> {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        system:
          "You write short animated-video story outlines. Respond ONLY with JSON matching: " +
          '{"title": string, "synopsis": string, "characters": [{"name": string, "description": string}], ' +
          '"scenes": [{"order": number, "prompt": string, "durationSec": number, "character": string, "background": string, "camera": string, "dialogue": string}]}',
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`TextProvider request failed (${res.status})`);
    const data = (await res.json()) as { text: string };
    return JSON.parse(data.text) as StoryResult;
  }
}

class HttpVoiceProvider implements VoiceProvider {
  private baseUrl: string;
  private apiKey: string;
  constructor() {
    if (!isConfigured(env.voiceProviderApiKey, env.voiceProviderBaseUrl)) {
      throw new ProviderNotConfiguredError("VoiceProvider");
    }
    this.baseUrl = env.voiceProviderBaseUrl!;
    this.apiKey = env.voiceProviderApiKey!;
  }
  async synthesize(req: VoiceRequest): Promise<VoiceResult> {
    const res = await fetch(`${this.baseUrl}/v1/tts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: req.text, language: req.language, voice_style: req.voiceStyle }),
    });
    if (!res.ok) throw new Error(`VoiceProvider request failed (${res.status})`);
    const data = (await res.json()) as { audio_url: string; duration_seconds: number };
    return { audioUrl: data.audio_url, durationSec: data.duration_seconds };
  }
  async listVoices() {
    const res = await fetch(`${this.baseUrl}/v1/voices`, { headers: { Authorization: `Bearer ${this.apiKey}` } });
    if (!res.ok) throw new Error(`VoiceProvider list failed (${res.status})`);
    return res.json();
  }
}

let imageToVideo: ImageToVideoProvider | null = null;
let text: TextProvider | null = null;
let voice: VoiceProvider | null = null;

export function getImageToVideoProvider(): ImageToVideoProvider {
  if (!imageToVideo) imageToVideo = new HttpImageToVideoProvider();
  return imageToVideo;
}
export function getTextProvider(): TextProvider {
  if (!text) text = new HttpTextProvider();
  return text;
}
export function getVoiceProvider(): VoiceProvider {
  if (!voice) voice = new HttpVoiceProvider();
  return voice;
}

export { getVideoProvider } from "./video.provider.js";
export { getStorageProvider } from "./storage.provider.js";
