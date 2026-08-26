import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.routes.js";
import { creditsRouter } from "./routes/credits.routes.js";
import { purchasesRouter } from "./routes/purchases.routes.js";
import { generateRouter } from "./routes/generate.routes.js";
import { projectsRouter } from "./routes/projects.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { moderationRouter } from "./routes/moderation.routes.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: "2mb" }));

// Global rate limit; tighter limits are applied per-route where it matters
// (auth, generation) to blunt credential-stuffing and generation abuse.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });
const generationLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30 });

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authLimiter, authRouter);
app.use("/api/credits", creditsRouter);
app.use("/api/purchases", purchasesRouter);
app.use("/api/generate", generationLimiter, generateRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/moderation", moderationRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(env.port, () => {
  console.log(`ToonAI Studio backend listening on port ${env.port}`);
});
