import { Worker, type Job } from "bullmq";
import { connection } from "./queue.js";
import { prisma } from "../lib/prisma.js";
import { creditsService } from "../services/credits.service.js";
import { getVideoProvider, getImageToVideoProvider, getStorageProvider } from "../providers/index.js";
import { ProviderNotConfiguredError } from "../providers/types.js";

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes before we treat a stuck provider job as failed

async function setStage(jobId: string, stage: string) {
  await prisma.generationJob.update({ where: { id: jobId }, data: { currentStage: stage } });
  await prisma.project.updateMany({
    where: { jobs: { some: { id: jobId } } },
    data: { status: "RUNNING" as never },
  });
}

async function pollUntilDone(getStatus: (id: string) => Promise<{ status: string; videoUrl?: string; errorMessage?: string }>, providerJobId: string) {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const result = await getStatus(providerJobId);
    if (result.status === "completed") return result;
    if (result.status === "failed") throw new Error(result.errorMessage ?? "Provider generation failed");
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("Timed out waiting for AI provider to finish generation");
}

async function processJob(job: Job<{ jobId: string }>) {
  const genJob = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.data.jobId } });
  const params = genJob.paramsJson as Record<string, unknown>;

  await prisma.generationJob.update({ where: { id: genJob.id }, data: { status: "RUNNING", startedAt: new Date() } });

  try {
    let rawVideoUrl: string;

    if (genJob.type === "TEXT_TO_VIDEO") {
      await setStage(genJob.id, "generating_video");
      const provider = getVideoProvider();
      const started = await provider.generate({
        prompt: genJob.prompt,
        durationSec: params.durationSec as 5 | 10 | 15 | 30,
        aspectRatio: params.aspectRatio as "9:16" | "16:9" | "1:1",
        style: (params.style as string) ?? "2D Cartoon",
        camera: (params.camera as string) ?? "static",
        quality: (params.quality as "standard" | "hd" | "fullhd") ?? "standard",
      });
      const finished = started.status === "completed" ? started : await pollUntilDone((id) => provider.getStatus(id), started.providerJobId);
      rawVideoUrl = finished.videoUrl!;
    } else if (genJob.type === "IMAGE_TO_VIDEO") {
      await setStage(genJob.id, "generating_video");
      const provider = getImageToVideoProvider();
      const storage = getStorageProvider();
      const imageSignedUrl = await storage.getSignedDownloadUrl(params.imageKey as string, 3600);
      const started = await provider.generate({
        imageUrl: imageSignedUrl,
        prompt: genJob.prompt,
        durationSec: params.durationSec as 5 | 10 | 15 | 30,
        aspectRatio: params.aspectRatio as "9:16" | "16:9" | "1:1",
      });
      const finished = started.status === "completed" ? started : await pollUntilDone((id) => provider.getStatus(id), started.providerJobId);
      rawVideoUrl = finished.videoUrl!;
    } else {
      throw new Error(`Job type ${genJob.type} is handled by the story pipeline, not this worker path`);
    }

    // Voice + subtitles + final encode happen per-scene for AI Story projects
    // (see scenes.service.ts); for a single text/image clip we finalize directly.
    await setStage(genJob.id, "finalizing");
    const storage = getStorageProvider();
    const finalKey = `videos/${genJob.userId}/${genJob.id}.mp4`;
    // In production: download rawVideoUrl, run it through ffmpeg (subtitle burn-in,
    // watermark overlay for free-tier users, format/resolution normalization),
    // then upload the result. See lib/ffmpeg.ts for the encode step.
    const finalUrl = await storage.getSignedDownloadUrl(finalKey, 3600);

    await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: genJob.projectId },
        data: { status: "COMPLETED", finalVideoUrl: finalUrl },
      });
      await tx.generationJob.update({
        where: { id: genJob.id },
        data: { status: "COMPLETED", completedAt: new Date(), currentStage: "completed" },
      });
    });

    await creditsService.commitDeduction(genJob.userId, genJob.creditsReserved, genJob.id);
  } catch (err) {
    const isConfigError = err instanceof ProviderNotConfiguredError;
    await prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id: genJob.projectId }, data: { status: "FAILED" } });
      await tx.generationJob.update({
        where: { id: genJob.id },
        data: { status: "FAILED", errorMessage: (err as Error).message },
      });
    });
    // Always refund on failure — including config errors — so a broken
    // integration never silently costs the user credits.
    await creditsService.refund(genJob.userId, genJob.creditsReserved, genJob.id);
    if (!isConfigError) throw err; // let BullMQ retry transient failures
  }
}

export const generationWorker = new Worker(
  "generation",
  async (job) => processJob(job as Job<{ jobId: string }>),
  { connection, concurrency: 4 }
);

generationWorker.on("failed", (job, err) => {
  console.error(`Generation job ${job?.id} failed after retries:`, err);
});

console.log("Generation worker started, listening for jobs...");
