import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { creditsService } from "../services/credits.service.js";
import { env, isConfigured } from "../config/env.js";
import { PurchaseStatus } from "@prisma/client";

export const purchasesRouter = Router();
purchasesRouter.use(requireAuth);

const verifySchema = z.object({
  productSku: z.string(),
  purchaseToken: z.string(),
  orderId: z.string().optional(),
});

/**
 * Client (Android app) sends the Play Billing purchase token here.
 * We NEVER trust a client-reported "success" — this route always calls
 * Google's Play Developer API server-to-server to confirm the purchase
 * before granting any credits.
 *
 * The purchase token is stored as a unique column, so if this endpoint is
 * called twice with the same token (retry, replay, or a malicious duplicate
 * request), the second call is a no-op — credits are granted exactly once.
 */
purchasesRouter.post("/verify", async (req: AuthedRequest, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { productSku, purchaseToken, orderId } = parsed.data;

  if (!isConfigured(env.googlePlayPackageName, env.googlePlayServiceAccountJson)) {
    return res.status(501).json({
      error: "Google Play Billing verification is not configured. Set GOOGLE_PLAY_PACKAGE_NAME and GOOGLE_PLAY_SERVICE_ACCOUNT_JSON.",
    });
  }

  const product = await prisma.creditProduct.findUnique({ where: { sku: productSku, isActive: true } });
  if (!product) return res.status(404).json({ error: "Unknown or inactive product SKU" });

  // Idempotency guard: purchaseToken has a unique DB constraint.
  const existing = await prisma.purchase.findUnique({ where: { playPurchaseToken: purchaseToken } });
  if (existing) {
    return res.json({ purchase: existing, message: "Already processed" });
  }

  const purchase = await prisma.purchase.create({
    data: {
      userId: req.userId!,
      creditProductId: product.id,
      status: PurchaseStatus.PENDING,
      amountInPaise: product.priceInPaise,
      currency: product.currency,
      playPurchaseToken: purchaseToken,
      playOrderId: orderId,
    },
  });

  try {
    const verification = await verifyWithGooglePlay(productSku, purchaseToken);
    if (!verification.valid) {
      await prisma.purchase.update({ where: { id: purchase.id }, data: { status: PurchaseStatus.FAILED } });
      return res.status(402).json({ error: "Purchase could not be verified with Google Play" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          status: PurchaseStatus.COMPLETED,
          creditsGranted: product.credits,
          rawProviderPayload: verification.raw as object,
        },
      });
    });
    await creditsService.grantFromPurchase(req.userId!, product.credits, purchase.id);

    const updated = await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
    return res.json({ purchase: updated });
  } catch (err) {
    await prisma.purchase.update({ where: { id: purchase.id }, data: { status: PurchaseStatus.FAILED } });
    return res.status(502).json({ error: "Verification with Google Play failed", detail: (err as Error).message });
  }
});

purchasesRouter.get("/history", async (req: AuthedRequest, res) => {
  const purchases = await prisma.purchase.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: "desc" },
    include: { creditProduct: true },
  });
  // Never return sensitive payment details (card numbers, tokens) — only
  // product, credits, amount, currency, date, status.
  res.json(
    purchases.map((p) => ({
      id: p.id,
      product: p.creditProduct?.label,
      credits: p.creditsGranted,
      amountInPaise: p.amountInPaise,
      currency: p.currency,
      status: p.status,
      createdAt: p.createdAt,
    }))
  );
});

async function verifyWithGooglePlay(
  productSku: string,
  purchaseToken: string
): Promise<{ valid: boolean; raw: unknown }> {
  // Real implementation: use googleapis' androidpublisher API with a service
  // account to call purchases.products.get, and check purchaseState === 0.
  // Left as an explicit integration point rather than a fake success —
  // wire this up once you have Play Console + service account credentials.
  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(env.googlePlayServiceAccountJson!),
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  const androidpublisher = google.androidpublisher({ version: "v3", auth });
  const result = await androidpublisher.purchases.products.get({
    packageName: env.googlePlayPackageName!,
    productId: productSku,
    token: purchaseToken,
  });
  const valid = result.data.purchaseState === 0; // 0 = purchased
  return { valid, raw: result.data };
}
