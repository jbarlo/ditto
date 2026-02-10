/**
 * Validate and normalize a MAC address.
 *
 * Accepts formats:
 * - AA:BB:CC:DD:EE:FF (colon-separated)
 * - AA-BB-CC-DD-EE-FF (dash-separated)
 * - AABBCCDDEEFF (no separator)
 *
 * Returns normalized format: AA:BB:CC:DD:EE:FF
 * Returns null if invalid.
 */
export function normalizeMac(mac: string): string | null {
  // Remove common separators and uppercase
  const stripped = mac.toUpperCase().replace(/[:\-]/g, "");

  // Must be exactly 12 hex characters
  if (!/^[A-F0-9]{12}$/.test(stripped)) {
    return null;
  }

  // Format as AA:BB:CC:DD:EE:FF
  return stripped.match(/.{2}/g)!.join(":");
}
