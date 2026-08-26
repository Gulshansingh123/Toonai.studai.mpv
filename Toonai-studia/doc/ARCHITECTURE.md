# Generation Pipeline

Frontend → Backend (reserve credits, create Project+GenerationJob, enqueue) → 202 response
  → BullMQ worker picks up job
    → VideoProvider / ImageToVideoProvider generates raw clip (polled until done or timeout)
    → [next] VoiceProvider synthesizes narration per scene
    → [next] subtitle generation from narration text
    → [next] FFmpeg: burn in subtitles, overlay watermark (free tier), normalize aspect/resolution
    → StorageProvider uploads final MP4, returns a signed URL
  → On success: commitDeduction() permanently removes reserved credits
  → On any failure (including "provider not configured"): refund() returns credits to the user,
    Project/Job marked FAILED with errorMessage

# Credit Ledger

CreditBalance{available, reserved} is the fast-read cache. CreditLedgerEntry is the append-only,
idempotency-keyed source of truth — every mutation (welcome bonus, purchase, reserve, deduct,
refund, admin adjustment) is one row, so balances can always be audited/recomputed and duplicate
webhooks/requests can't double-apply (unique idempotencyKey / purchase token constraints).

# Adding a new AI vendor

Implement the relevant interface in src/providers/types.ts against your vendor's actual API shape,
export it from src/providers/index.ts in place of the Http*Provider, and set the corresponding
*_API_KEY / *_BASE_URL env vars. Nothing else in routes/ or jobs/ needs to change.
