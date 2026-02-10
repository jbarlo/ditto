// display
export const DISPLAY_WIDTH = 800;
export const DISPLAY_HEIGHT = 480;
export const DISPLAY_COLORS = ["#000000", "#555555", "#aaaaaa", "#ffffff"];
export const DEFAULT_REFRESH_RATE = 600; // seconds (10 minutes)

// battery (default: Seeed TRMNL DIY kit lipo)
export const BATTERY_MAX_VOLTAGE = 4.2;
export const BATTERY_MIN_VOLTAGE = 2.75;

// doodling
export const MAX_BRUSH_SIZE = 20;
export const STROKE_POLL_INTERVAL = 2500; // ms
export const STROKE_RETENTION = 60 * 60 * 1000; // 1 hour in ms

// sharing
export const INVITE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 1 week in ms
