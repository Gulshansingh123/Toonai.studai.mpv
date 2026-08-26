import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { env, isConfigured } from "../config/env.js";

export const moderationRouter = Router();
moderationRouter.use(requireAuth);

const reportSchema = z.object({
  projectId: z.string().uuid().optional(),
  reason: z.string().min(3).max(200),
  details: z.string().max(2000).optional(),
});
moderationRouter.post("/report", async (req: AuthedRequest, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const report = await prisma.contentReport.create({
    data: { userId: req.userId!, ...parsed.data },
  });
  res.status(201).json(report);
});

/**
 * Called from generate.routes.ts before a prompt is queued for generation.
 * Blocks unsafe prompts (sexual content involving minors, non-consensual
 * likeness/voice cloning of real people, hate/violence, copyrighted IP
 * misuse) server-side, so it can't be bypassed from a modified client.
 */
export async function moderatePrompt(prompt: string): Promise<{ allowed: boolean; reason?: string }> {
  if (!isConfigured(env.moderationProviderApiKey)) {
    // Fail closed in production: without a moderation provider configured,
    // block generation rather than silently skipping the safety check.
    return { allowed: false, reason: "Content moderation provider not configured" };
  }
  const res = await fetch(`https://api.moderation-provider.example/v1/check`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.moderationProviderApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: prompt }),
  });
  const data = (await res.json()) as { flagged: boolean; reason?: string };
  return { allowed: !data.flagged, reason: data.reason };
}
