import { z } from "zod";

const bool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  PUBLIC_URL: z.url(),
  PORT: z.coerce.number().int().default(3000),

  DATABASE_URL: z.url(),
  REDIS_URL: z.url().default("redis://localhost:6379"),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "must be 32 bytes hex (openssl rand -hex 32)"),

  SLACK_CLIENT_ID: z.string().min(1),
  SLACK_CLIENT_SECRET: z.string().min(1),
  SLACK_SIGNING_SECRET: z.string().min(1),
  SLACK_STATE_SECRET: z.string().min(16),

  ANTHROPIC_API_KEY: z.string().min(1),
  AGENT_MODEL: z.string().default("claude-opus-5-5"),
  FAST_MODEL: z.string().default("claude-haiku-5-5"),
  AGENT_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("high"),
  AGENT_MAX_RUN_USD: z.coerce.number().positive().default(5),
  AGENT_MAX_TURNS: z.coerce.number().int().positive().default(40),
  AGENT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60_000),

  COMPOSIO_API_KEY: z.string().min(1),
  COMPOSIO_WEBHOOK_SECRET: z.string().optional(),

  SANDBOX_IMAGE: z.string().default("viktor-sandbox:latest"),
  SANDBOX_MEMORY_MB: z.coerce.number().int().positive().default(2048),
  SANDBOX_CPUS: z.coerce.number().positive().default(1),
  SANDBOX_NETWORK: z.string().default("bridge"),
  SANDBOX_IDLE_MINUTES: z.coerce.number().int().positive().default(30),

  VOYAGE_API_KEY: z.string().optional(),
  DEFAULT_MONTHLY_BUDGET_USD: z.coerce.number().nonnegative().default(100),
  PROACTIVE_ENABLED: bool.default(true),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
