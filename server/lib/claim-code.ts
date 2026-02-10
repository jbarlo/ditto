import { createHmac } from "crypto";
import { env } from "./env";

// 5 chars from 32-char alphabet = ~33 million possibilities
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No ambiguous chars (0/O, 1/I/L)
const CODE_LENGTH = 5;
const BUCKET_SECONDS = 120; // 2-minute buckets
const VALID_BUCKETS = 5; // Accept current + 4 previous = 10 min window

function getBucket(timestamp: number = Date.now()): number {
  return Math.floor(timestamp / 1000 / BUCKET_SECONDS);
}

function encodeBase32(num: number): string {
  let result = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    result = ALPHABET[num % ALPHABET.length] + result;
    num = Math.floor(num / ALPHABET.length);
  }
  return result;
}

function computeCode(friendlyId: string, bucket: number, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(`${friendlyId}:${bucket}`);
  const hash = hmac.digest();
  // Take first 4 bytes as a number, then encode
  const num = hash.readUInt32BE(0);
  return encodeBase32(num);
}

/**
 * Generate a time-limited claim code for a device.
 * The code is derived from the device's friendly_id and current time bucket.
 */
export function generateClaimCode(friendlyId: string): string {
  const secret = env.CLAIM_SECRET;
  const bucket = getBucket();
  return computeCode(friendlyId, bucket, secret);
}

/**
 * Validate a claim code against a device's friendly_id.
 * Returns true if the code matches any valid time bucket (current + recent).
 */
export function validateClaimCode(friendlyId: string, code: string): boolean {
  const secret = env.CLAIM_SECRET;
  const currentBucket = getBucket();

  // Check current bucket + previous buckets
  for (let i = 0; i < VALID_BUCKETS; i++) {
    const expected = computeCode(friendlyId, currentBucket - i, secret);
    if (expected.toUpperCase() === code.toUpperCase()) {
      return true;
    }
  }

  return false;
}
