import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

projectsRouter.get("/", async (req: AuthedRequest, res) => {
  const projects = await prisma.project.findMany({
    where: { userId: req.userId!, isDeleted: false },
    orderBy: { createdAt: "desc" },
  });
  res.json(projects);
});

projectsRouter.get("/:id", async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId!, isDeleted: false },
    include: { scenes: { orderBy: { order: "asc" } }, jobs: { orderBy: { createdAt: "desc" } } },
  });
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(project);
});

const renameSchema = z.object({ title: z.string().min(1).max(120) });
projectsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const parsed = renameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const project = await prisma.project.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: { title: parsed.data.title },
  });
  if (project.count === 0) return res.status(404).json({ error: "Project not found" });
  res.status(204).send();
});

projectsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const result = await prisma.project.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: { isDeleted: true },
  });
  if (result.count === 0) return res.status(404).json({ error: "Project not found" });
  res.status(204).send();
});
