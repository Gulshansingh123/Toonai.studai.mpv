import { env, isConfigured } from "../config/env.js";
import {
  ProviderNotConfiguredError,
  type TextToVideoRequest,
  type VideoGenerationResult,
  type VideoProvider,
} from "./types.js";

/**
 * Generic REST adapter for a text-to-video vendor (e.g. Runway, Luma, Pika,
 * Kling, or an in-house model server). Point VIDEO_PROVIDER_BASE_URL /
 * VIDEO_PROVIDER_API_KEY at whichever vendor you contract with — this makes
 * real HTTP calls, it does not fabricate results.
 *
 * If your chosen vendor's API shape differs, adjust the two methods below;
 * everything else in the app depends only on the VideoProvider interface.
 */
class HttpVideoProvider implements VideoProvider {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    if (!isConfigured(env.videoProviderApiKey, env.videoProviderBaseUrl)) {
      throw new ProviderNotConfiguredError("VideoProvider");
    }
    this.baseUrl = env.videoProviderBaseUrl!;
    this.apiKey = env.videoProviderApiKey!;
  }

  async generate(req: TextToVideoRequest): Promise<VideoGenerationResult> {
    const res = await fetch(`${this.baseUrl}/v1/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: req.prompt,
        duration_seconds: req.durationSec,
        aspect_ratio: req.aspectRatio,
        style: req.style,
        camera_motion: req.camera,
        quality: req.quality,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`VideoProvider request failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as { id: string; status: string; video_url?: string };
    return {
      providerJobId: data.id,
      status: mapStatus(data.status),
      videoUrl: data.video_url,
    };
  }

  async getStatus(providerJobId: string): Promise<VideoGenerationResult> {
    const res = await fetch(`${this.baseUrl}/v1/generations/${providerJobId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`VideoProvider status check failed (${res.status})`);
    }
    const data = (await res.json()) as { id: string; status: string; video_url?: string; error?: string };
    return {
      providerJobId: data.id,
      status: mapStatus(data.status),
      videoUrl: data.video_url,
      errorMessage: data.error,
    };
  }
}

function mapStatus(vendorStatus: string): "processing" | "completed" | "failed" {
  if (["completed", "succeeded", "done"].includes(vendorStatus)) return "completed";
  if (["failed", "error"].includes(vendorStatus)) return "failed";
  return "processing";
}

let instance: VideoProvider | null = null;
export function getVideoProvider(): VideoProvider {
  if (!instance) instance = new HttpVideoProvider();
  return instance;
}
