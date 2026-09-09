import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

const buildFallbacks = {
  DATABASE_URL: "postgresql://build:build@localhost:5432/build",
  AUTH_SECRET: "build-only-placeholder-secret-32-characters-long",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};

export const env = schema.parse(
  process.env.NEXT_PHASE === "phase-production-build"
    ? {
        DATABASE_URL: process.env.DATABASE_URL ?? buildFallbacks.DATABASE_URL,
        AUTH_SECRET: process.env.AUTH_SECRET ?? buildFallbacks.AUTH_SECRET,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? buildFallbacks.NEXT_PUBLIC_APP_URL,
      }
    : {
        DATABASE_URL: process.env.DATABASE_URL,
        AUTH_SECRET: process.env.AUTH_SECRET,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      },
);
