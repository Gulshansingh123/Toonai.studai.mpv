import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from "../lib/auth.js";
import { creditsService } from "../services/credits.service.js";
import { env, isConfigured } from "../config/env.js";
import { AuthProvider } from "@prisma/client";

export const authRouter = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1).max(80).optional(),
});

authRouter.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password, displayName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "An account with this email already exists" });

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, displayName, authProvider: AuthProvider.EMAIL, isVerified: false },
  });

  // In production: send a verification email/OTP here before setting isVerified=true.
  // Free credits are granted only to verified accounts (see /verify-email).
  return res.status(201).json({ userId: user.id, message: "Account created. Please verify your email." });
});

const verifySchema = z.object({ userId: z.string().uuid(), code: z.string() });
authRouter.post("/verify-email", async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // TODO: check the verification code against a stored/short-lived OTP record.
  // Stubbed here as a config error until an email/OTP provider is wired up.
  return res.status(501).json({
    error: "Email verification provider not configured. Wire up an email/OTP service before enabling signup.",
  });
});

const loginSchema = z.object({ email: z.string().email(), password: z.string() });
authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return res.status(401).json({ error: "Invalid email or password" });
  if (user.isBanned) return res.status(403).json({ error: "This account has been suspended" });

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid email or password" });

  await issueSession(res, user.id, user.isAdmin);
});

// Google Sign-In: frontend obtains an ID token via Google's SDK and sends it here.
// The backend verifies the token signature against Google before trusting it.
const googleSchema = z.object({ idToken: z.string() });
authRouter.post("/google", async (req, res) => {
  if (!isConfigured(env.googleClientId)) {
    return res.status(501).json({ error: "Google Sign-In is not configured (missing GOOGLE_CLIENT_ID)." });
  }
  const parsed = googleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { OAuth2Client } = await import("google-auth-library");
  const client = new OAuth2Client(env.googleClientId);
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: parsed.data.idToken, audience: env.googleClientId });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: "Invalid Google ID token" });
  }
  if (!payload?.sub || !payload.email) return res.status(401).json({ error: "Invalid Google token payload" });

  const user = await prisma.user.upsert({
    where: { googleId: payload.sub },
    update: {},
    create: {
      googleId: payload.sub,
      email: payload.email,
      displayName: payload.name,
      avatarUrl: payload.picture,
      authProvider: AuthProvider.GOOGLE,
      isVerified: true, // Google already verified the email
    },
  });
  if (user.isBanned) return res.status(403).json({ error: "This account has been suspended" });

  await creditsService.grantWelcomeCreditsIfEligible(user.id);
  await issueSession(res, user.id, user.isAdmin);
});

// Phone/OTP: architecture only. Requires an SMS provider (MSG91/Twilio Verify/etc).
authRouter.post("/phone/request-otp", async (_req, res) => {
  if (!isConfigured(env.otpProviderApiKey)) {
    return res.status(501).json({ error: "SMS/OTP provider not configured. Set OTP_PROVIDER_API_KEY." });
  }
  return res.status(501).json({ error: "Implement OTP send using your configured SMS provider here." });
});
authRouter.post("/phone/verify-otp", async (_req, res) => {
  if (!isConfigured(env.otpProviderApiKey)) {
    return res.status(501).json({ error: "SMS/OTP provider not configured. Set OTP_PROVIDER_API_KEY." });
  }
  return res.status(501).json({ error: "Implement OTP verification + session issuance here." });
});

const refreshSchema = z.object({ refreshToken: z.string() });
authRouter.post("/refresh", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const tokenHash = hashRefreshToken(parsed.data.refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: stored.userId } });

  // Rotate: revoke old, issue new (prevents replay of a leaked refresh token).
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  await issueSession(res, user.id, user.isAdmin);
});

authRouter.post("/logout", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (parsed.success) {
    const tokenHash = hashRefreshToken(parsed.data.refreshToken);
    await prisma.refreshToken.updateMany({ where: { tokenHash }, data: { revokedAt: new Date() } });
  }
  res.status(204).send();
});

async function issueSession(res: import("express").Response, userId: string, isAdmin: boolean) {
  const accessToken = signAccessToken({ sub: userId, isAdmin });
  const { token: refreshToken, tokenHash } = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  return res.json({ accessToken, refreshToken });
}
