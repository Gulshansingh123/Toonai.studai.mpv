import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { creditsService } from "../services/credits.service.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";

export const creditsRouter = Router();
creditsRouter.use(requireAuth);

creditsRouter.get("/balance", async (req: AuthedRequest, res) => {
  const balance = await creditsService.getBalance(req.userId!);
  res.json(balance);
});

creditsRouter.get("/history", async (req: AuthedRequest, res) => {
  const entries = await prisma.creditLedgerEntry.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(entries);
});

creditsRouter.get("/products", async (_req, res) => {
  const products = await prisma.creditProduct.findMany({ where: { isActive: true } });
  res.json(products);
});
