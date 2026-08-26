import "dotenv/config";

function required(name: string, fallback?: string): string {
  const val = process.env[name] ?? fallback;
  if (val === undefined) {
    // Fail loudly at boot rather than silently degrading into fake behavior.
    throw new Error(`Missing required environment variable: ${name}. See .env.example`);
  }
  return val;
}

function optional(name: string): string | undefined {
  return process.env[name];
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),

  databaseUrl: required("DATABASE_URL"),
  redisUrl: required("REDIS_URL", "redis://localhost:6379"),

  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL ?? "30d",

  googleClientId: optional("GOOGLE_CLIENT_ID"),
  googleClientSecret: optional("GOOGLE_CLIENT_SECRET"),

  // SMS/OTP provider (e.g. MSG91, Twilio Verify) — phone auth is disabled
  // at the route level until these are set (see auth.routes.ts).
  otpProviderApiKey: optional("OTP_PROVIDER_API_KEY"),
  otpProviderSenderId: optional("OTP_PROVIDER_SENDER_ID"),

  // S3-compatible storage
  s3Endpoint: optional("S3_ENDPOINT"),
  s3Region: optional("S3_REGION"),
  s3Bucket: optional("S3_BUCKET"),
  s3AccessKeyId: optional("S3_ACCESS_KEY_ID"),
  s3SecretAccessKey: optional("S3_SECRET_ACCESS_KEY"),
  signedUrlTtlSeconds: Number(process.env.SIGNED_URL_TTL_SECONDS ?? 3600),

  // AI providers — text/video/voice. Configure whichever vendor you contract with.
  videoProviderApiKey: optional("VIDEO_PROVIDER_API_KEY"),
  videoProviderBaseUrl: optional("VIDEO_PROVIDER_BASE_URL"),
  imageToVideoProviderApiKey: optional("IMAGE_TO_VIDEO_PROVIDER_API_KEY"),
  imageToVideoProviderBaseUrl: optional("IMAGE_TO_VIDEO_PROVIDER_BASE_URL"),
  textProviderApiKey: optional("TEXT_PROVIDER_API_KEY"),
  textProviderBaseUrl: optional("TEXT_PROVIDER_BASE_URL"),
  voiceProviderApiKey: optional("VOICE_PROVIDER_API_KEY"),
  voiceProviderBaseUrl: optional("VOICE_PROVIDER_BASE_URL"),

  // Google Play Billing server-side verification
  googlePlayPackageName: optional("GOOGLE_PLAY_PACKAGE_NAME"),
  googlePlayServiceAccountJson: optional("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"),

  // Rewarded ads (e.g. AdMob / Unity Ads server-side reward callback verification)
  adProviderVerificationKey: optional("AD_PROVIDER_VERIFICATION_KEY"),

  moderationProviderApiKey: optional("MODERATION_PROVIDER_API_KEY"),

  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
};

export function isConfigured(...keys: (string | undefined)[]): boolean {
  return keys.every((k) => !!k);
}
