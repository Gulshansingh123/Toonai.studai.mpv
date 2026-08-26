import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { creditsService, getCreditCostForDuration, InsufficientCreditsError } from "../services/credits.service.js";
import { enqueueGenerationJob } from "../jobs/queue.js";
import { getStorageProvider } from "../providers/index.js";
import { JobType } from "@prisma/client";
import { v4 as uuid } from "uuid";
import { moderatePrompt } from "./moderation.routes.js";

export const generateRouter = Router();
generateRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    if (!["image/jpeg", "image/png"].includes(file.mimetype)) {
      return cb(new Error("Only JPG/PNG images are allowed"));
    }
    cb(null, true);
  },
});

const DURATIONS = [5, 10, 15, 30] as const;
const ASPECTS = ["9:16", "16:9", "1:1"] as const;

const textToVideoSchema = z.object({
  prompt: z.string().min(3).max(1000),
  durationSec: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)]),
  aspectRatio: z.enum(ASPECTS),
  style: z.string(),
  camera: z.string().default("static"),
  quality: z.enum(["standard", "hd", "fullhd"]).default("standard"),
});

/**
 * Every generation follows: verify user -> check balance -> reserve credits ->
 * create Project + GenerationJob (status QUEUED) -> enqueue background job.
 * The HTTP response returns immediately with a jobId; the client polls
 * GET /projects/:id or subscribes to job status. Nothing here calls an AI
 * provider synchronously.
 */
generateRouter.post("/text-to-video", async (req: AuthedRequest, res) => {
  const parsed = textToVideoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const input = parsed.data;

  const moderation = await moderatePrompt(input.prompt);
  if (!moderation.allowed) {
    return res.status(422).json({ error: "Prompt rejected by content moderation", detail: moderation.reason });
  }

  const cost = await getCreditCostForDuration(input.durationSec);

  const project = await prisma.project.create({
    data: {
      userId: req.userId!,
      title: input.prompt.slice(0, 60),
      durationSec: input.durationSec,
      aspectRatio: input.aspectRatio,
      style: input.style,
      status: "QUEUED",
    },
  });

  const job = await prisma.generationJob.create({
    data: {
      projectId: project.id,
      userId: req.userId!,
      type: JobType.TEXT_TO_VIDEO,
      creditsReserved: cost,
      prompt: input.prompt,
      paramsJson: input,
    },
  });

  try {
    await creditsService.reserve(req.userId!, cost, job.id);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      await prisma.generationJob.update({ where: { id: job.id }, data: { status: "FAILED", errorMessage: "Insufficient credits" } });
      return res.status(402).json({ error: "Insufficient credits" });
    }
    throw err;
  }

  await enqueueGenerationJob(job.id);
  res.status(202).json({ projectId: project.id, jobId: job.id, creditsReserved: cost });
});

const imageToVideoSchema = z.object({
  prompt: z.string().min(3).max(1000),
  durationSec: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)]),
  aspectRatio: z.enum(ASPECTS),
});

generateRouter.post("/image-to-video", upload.single("image"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "An image file (JPG/PNG) is required" });
  const parsed = imageToVideoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const input = parsed.data;

  const cost = await getCreditCostForDuration(input.durationSec);

  let imageKey: string;
  try {
    const storage = getStorageProvider();
    imageKey = `uploads/${req.userId}/${uuid()}.jpg`;
    await storage.putObject(imageKey, req.file.buffer, req.file.mimetype);
  } catch (err) {
    return res.status(503).json({ error: (err as Error).message });
  }

  const project = await prisma.project.create({
    data: {
      userId: req.userId!,
      title: input.prompt.slice(0, 60),
      durationSec: input.durationSec,
      aspectRatio: input.aspectRatio,
      style: "image-to-video",
      status: "QUEUED",
    },
  });

  const job = await prisma.generationJob.create({
    data: {
      projectId: project.id,
      userId: req.userId!,
      type: JobType.IMAGE_TO_VIDEO,
      creditsReserved: cost,
      prompt: input.prompt,
      paramsJson: { ...input, imageKey },
    },
  });

  try {
    await creditsService.reserve(req.userId!, cost, job.id);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      await prisma.generationJob.update({ where: { id: job.id }, data: { status: "FAILED", errorMessage: "Insufficient credits" } });
      return res.status(402).json({ error: "Insufficient credits" });
    }
    throw err;
  }

  await enqueueGenerationJob(job.id);
  res.status(202).json({ projectId: project.id, jobId: job.id, creditsReserved: cost });
});

generateRouter.get("/jobs/:jobId", async (req: AuthedRequest, res) => {
  const job = await prisma.generationJob.findFirst({
    where: { id: req.params.jobId, userId: req.userId! },
  });
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});
