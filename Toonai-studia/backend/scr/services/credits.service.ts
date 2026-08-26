import { prisma } from "../lib/prisma.js";
import { CreditTxnType } from "@prisma/client";

export class InsufficientCreditsError extends Error {
  constructor() {
    super("Insufficient credits");
    this.name = "InsufficientCreditsError";
  }
}

/**
 * All credit mutations go through this service, inside a Postgres transaction
 * with a row lock on CreditBalance, so concurrent requests (e.g. double-tap
 * "Generate", or a replayed request) can never double-spend or double-grant.
 */
export const creditsService = {
  async getBalance(userId: string) {
    const balance = await prisma.creditBalance.upsert({
      where: { userId },
      update: {},
      create: { userId, available: 0, reserved: 0 },
    });
    return balance;
  },

  async grantWelcomeCreditsIfEligible(userId: string, amount = 10) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.hasReceivedWelcomeCredits) return null;

      await tx.user.update({
        where: { id: userId },
        data: { hasReceivedWelcomeCredits: true },
      });

      const balance = await tx.creditBalance.upsert({
        where: { userId },
        update: { available: { increment: amount } },
        create: { userId, available: amount, reserved: 0 },
      });

      await tx.creditLedgerEntry.create({
        data: {
          userId,
          type: CreditTxnType.WELCOME_BONUS,
          amount,
          balanceAfter: balance.available,
          idempotencyKey: `welcome:${userId}`,
          note: "One-time welcome bonus on verified signup",
        },
      });

      return balance;
    });
  },

  /** Move credits from `available` into `reserved` before starting a paid job. */
  async reserve(userId: string, amount: number, jobId: string) {
    return prisma.$transaction(async (tx) => {
      const balance = await tx.creditBalance.findUnique({ where: { userId } });
      if (!balance || balance.available < amount) {
        throw new InsufficientCreditsError();
      }
      const updated = await tx.creditBalance.update({
        where: { userId },
        data: { available: { decrement: amount }, reserved: { increment: amount } },
      });
      await tx.creditLedgerEntry.create({
        data: {
          userId,
          type: CreditTxnType.RESERVE,
          amount: -amount,
          balanceAfter: updated.available,
          jobId,
          idempotencyKey: `reserve:${jobId}`,
        },
      });
      return updated;
    });
  },

  /** On successful generation: permanently remove the reserved amount. */
  async commitDeduction(userId: string, amount: number, jobId: string) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.creditBalance.update({
        where: { userId },
        data: { reserved: { decrement: amount } },
      });
      await tx.creditLedgerEntry.create({
        data: {
          userId,
          type: CreditTxnType.DEDUCT,
          amount: -amount,
          balanceAfter: updated.available,
          jobId,
          idempotencyKey: `deduct:${jobId}`,
        },
      });
      return updated;
    });
  },

  /** On failure/timeout: return reserved credits to the spendable balance. */
  async refund(userId: string, amount: number, jobId: string) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.creditBalance.update({
        where: { userId },
        data: { reserved: { decrement: amount }, available: { increment: amount } },
      });
      await tx.creditLedgerEntry.create({
        data: {
          userId,
          type: CreditTxnType.REFUND,
          amount,
          balanceAfter: updated.available,
          jobId,
          idempotencyKey: `refund:${jobId}`,
        },
      });
      return updated;
    });
  },

  /** Grant credits from a verified purchase. purchaseId acts as idempotency guard upstream. */
  async grantFromPurchase(userId: string, amount: number, purchaseId: string) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.creditBalance.upsert({
        where: { userId },
        update: { available: { increment: amount } },
        create: { userId, available: amount, reserved: 0 },
      });
      await tx.creditLedgerEntry.create({
        data: {
          userId,
          type: CreditTxnType.PURCHASE,
          amount,
          balanceAfter: updated.available,
          purchaseId,
          idempotencyKey: `purchase:${purchaseId}`,
        },
      });
      return updated;
    });
  },
};

// Configurable per-duration credit costs. Backed by AdminSetting table;
// these are fallback defaults if no admin override exists yet.
export const DEFAULT_CREDIT_COSTS: Record<number, number> = {
  5: 1,
  10: 2,
  15: 3,
  30: 5,
};

export async function getCreditCostForDuration(durationSec: number): Promise<number> {
  const setting = await prisma.adminSetting.findUnique({ where: { key: "credit_costs" } });
  const costs = (setting?.value as Record<string, number>) ?? DEFAULT_CREDIT_COSTS;
  const cost = costs[String(durationSec)];
  if (cost === undefined) {
    throw new Error(`No credit cost configured for duration ${durationSec}s`);
  }
  return cost;
}
