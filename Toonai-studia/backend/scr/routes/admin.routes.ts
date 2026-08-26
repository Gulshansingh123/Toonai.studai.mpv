import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin, type AuthedRequest } from "../middleware/requireAuth.js";
import { PurchaseStatus } from "@prisma/client";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

// --- Dashboard summary -----------------------------------------------------
adminRouter.get("/summary", async (_req, res) => {
  const [userCount, projectCount, failedJobs, revenueAgg] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.generationJob.count({ where: { status: "FAILED" } }),
    prisma.purchase.aggregate({
      where: { status: PurchaseStatus.COMPLETED },
      _sum: { amountInPaise: true },
    }),
  ]);
  res.json({
    userCount,
    projectCount,
    failedJobs,
    // Verified-payment totals only — this is never editable via the admin API.
    totalRevenueInPaise: revenueAgg._sum.amountInPaise ?? 0,
  });
});

adminRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, phone: true, isVerified: true, isBanned: true, isAdmin: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(users);
});

const banSchema = z.object({ isBanned: z.boolean() });
adminRouter.patch("/users/:id/ban", async (req, res) => {
  const parsed = banSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  await prisma.user.update({ where: { id: req.params.id }, data: { isBanned: parsed.data.isBanned } });
  res.status(204).send();
});

adminRouter.get("/purchases", async (_req, res) => {
  const purchases = await prisma.purchase.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { creditProduct: true, user: { select: { email: true } } },
  });
  res.json(purchases);
});

adminRouter.get("/jobs", async (_req, res) => {
  const jobs = await prisma.generationJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(jobs);
});

// --- Configurable settings ---------------------------------------------------
// Credit costs per duration, e.g. { "5": 1, "10": 2, "15": 3, "30": 5 }
const creditCostsSchema = z.record(z.string(), z.number().int().positive());
adminRouter.put("/settings/credit-costs", async (req: AuthedRequest, res) => {
  const parsed = creditCostsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  await prisma.adminSetting.upsert({
    where: { key: "credit_costs" },
    update: { value: parsed.data, updatedBy: req.userId },
    create: { key: "credit_costs", value: parsed.data, updatedBy: req.userId },
  });
  res.status(204).send();
});

const welcomeCreditsSchema = z.object({ amount: z.number().int().nonnegative() });
adminRouter.put("/settings/welcome-credits", async (req: AuthedRequest, res) => {
  const parsed = welcomeCreditsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  await prisma.adminSetting.upsert({
    where: { key: "welcome_credits" },
    update: { value: parsed.data, updatedBy: req.userId },
    create: { key: "welcome_credits", value: parsed.data, updatedBy: req.userId },
  });
  res.status(204).send();
});

// Credit packs (one-time purchase products)
const creditProductSchema = z.object({
  sku: z.string(),
  label: z.string(),
  credits: z.number().int().positive(),
  priceInPaise: z.number().int().positive(),
  isActive: z.boolean().default(true),
});
adminRouter.post("/credit-products", async (req, res) => {
  const parsed = creditProductSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const product = await prisma.creditProduct.upsert({
    where: { sku: parsed.data.sku },
    update: parsed.data,
    create: parsed.data,
  });
  res.json(product);
});

// Subscription plans
const subscriptionProductSchema = z.object({
  plan: z.enum(["FREE", "BASIC", "CREATOR", "PRO"]),
  sku: z.string().optional(),
  monthlyCredits: z.number().int().nonnegative(),
  priceInPaise: z.number().int().nonnegative(),
  isActive: z.boolean().default(true),
});
adminRouter.post("/subscription-products", async (req, res) => {
  const parsed = subscriptionProductSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const product = await prisma.subscriptionProduct.upsert({
    where: { plan: parsed.data.plan },
    update: parsed.data,
    create: parsed.data,
  });
  res.json(product);
});

// Promotional credits — explicit admin adjustment, fully audited via the ledger,
// and clearly distinguished from verified purchases (never edits Purchase rows).
const grantSchema = z.object({ userId: z.string().uuid(), amount: z.number().int(), note: z.string().optional() });
adminRouter.post("/credits/grant", async (req: AuthedRequest, res) => {
  const parsed = grantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { userId, amount, note } = parsed.data;
  await prisma.$transaction(async (tx) => {
    const balance = await tx.creditBalance.upsert({
      where: { userId },
      update: { available: { increment: amount } },
      create: { userId, available: Math.max(amount, 0), reserved: 0 },
    });
    await tx.creditLedgerEntry.create({
      data: {
        userId,
        type: "ADMIN_ADJUSTMENT",
        amount,
        balanceAfter: balance.available,
        note: note ?? `Admin adjustment by ${req.userId}`,
      },
    });
  });
  res.status(204).send();
});
