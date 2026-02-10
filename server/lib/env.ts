/**
 * Centralized environment variable validation.
 * Import this module early to fail fast on misconfiguration.
 */

function requireUrl(name: string, required: boolean = true): string | undefined {
  const value = process.env[name];

  if (!value) {
    if (required && process.env.NODE_ENV === "production") {
      throw new Error(`${name} environment variable is required in production`);
    }
    return undefined;
  }

  if (!value.startsWith("http")) {
    throw new Error(`${name} must include protocol (https://)`);
  }

  return value.replace(/\/$/, ""); // Strip trailing slash
}

function require(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`${name} environment variable is required`);
  }
  return value ?? "";
}

export const env = {
  BASE_URL: requireUrl("BASE_URL")!,
  R2_PUBLIC_URL: requireUrl("R2_PUBLIC_URL", false),

  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,

  TURSO_URL: process.env.TURSO_URL,
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,

  CLAIM_SECRET: require("CLAIM_SECRET"),

  isProduction: process.env.NODE_ENV === "production",

  get isR2Configured() {
    return !!(
      this.R2_ACCOUNT_ID &&
      this.R2_ACCESS_KEY_ID &&
      this.R2_SECRET_ACCESS_KEY &&
      this.R2_BUCKET_NAME
    );
  },

  get isTursoConfigured() {
    return !!(this.TURSO_URL && this.TURSO_AUTH_TOKEN);
  },
};

if (env.isProduction && !env.isR2Configured) {
  throw new Error("R2 storage must be configured in production");
}

if (env.isR2Configured && !env.R2_PUBLIC_URL) {
  throw new Error("R2_PUBLIC_URL is required when R2 storage is configured");
}

if (env.isProduction && !env.isTursoConfigured) {
  throw new Error("Turso database must be configured in production");
}
