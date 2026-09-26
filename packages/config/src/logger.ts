import { pino } from "pino";

const pretty = process.env.NODE_ENV !== "production" && process.stdout.isTTY;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: ["*.token", "*.botToken", "*.accessToken", "*.apiKey", "headers.authorization"],
    censor: "[redacted]",
  },
  ...(pretty ? { transport: { target: "pino-pretty", options: { singleLine: true } } } : {}),
});

export type Logger = typeof logger;
