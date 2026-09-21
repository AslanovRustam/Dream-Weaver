// The event vocabulary, shared by the browser and the ingest route so neither
// can drift. An allowlist rather than free-form names: the table stays
// readable, and a public endpoint cannot be turned into a scratch database.

export const ANALYTICS_EVENTS = [
  "page_view",
  // Templates
  "template_catalog_opened",
  "template_selected",
  // Banner
  "generate_clicked",
  "generate_result",
  "resize_batch_started",
  // Landing
  "landing_template_selected",
  "landing_exported",
  // Onboarding
  "onboarding_opened",
  "tour_started",
  "tour_step_done",
  "tour_completed",
  "tour_abandoned",
  // Account
  "auth_gate_shown",
  "consent_set",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export const ANALYTICS_EVENT_SET: ReadonlySet<string> = new Set(ANALYTICS_EVENTS);

/** Scalars only — no objects, no free text from the user. */
export type AnalyticsProps = Record<string, string | number | boolean>;

export const MAX_EVENTS_PER_BATCH = 20;
export const MAX_PROP_KEYS = 10;
export const MAX_PROP_LENGTH = 200;
export const MAX_PATH_LENGTH = 300;
export const MAX_ID_LENGTH = 64;
/** 16 KB is far more than a full batch needs. */
export const MAX_BATCH_BYTES = 16 * 1024;
