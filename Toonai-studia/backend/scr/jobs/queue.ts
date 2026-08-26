import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env.js";

export const connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });

export const generationQueue = new Queue("generation", { connection });

export async function enqueueGenerationJob(jobId: string) {
  await generationQueue.add(
    "process",
    { jobId },
    {
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 500,
      removeOnFail: 500,
    }
  );
}
