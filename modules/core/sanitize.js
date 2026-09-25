/* ── ZenFit V2 · core/sanitize.js ──────────────────────────
   ALL user-controlled strings pass through here before storage
   or innerHTML. Prevents XSS / HTML injection (Step 14).
   Pure functions — no DOM, no state.
────────────────────────────────────────────────────────────── */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

/** Escape a value for safe innerHTML interpolation. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, (c) => HTML_ESCAPES[c]);
}

/**
 * Strip tags / event handlers / dangerous protocols from free text.
 * Keeps plain readable text, caps length.
 */
export function sanitizeText(value, maxLen = 500) {
  let s = String(value ?? '');
  // Remove <script>/<style> blocks entirely, then all tags
  s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, '')
       .replace(/<style[\s\S]*?<\/style\s*>/gi, '')
       .replace(/<[^>]*>/g, '');
  // Kill javascript:/data:/vbscript: protocols and inline handlers
  s = s.replace(/(javascript|data|vbscript)\s*:/gi, '')
       .replace(/\bon\w+\s*=/gi, '');
  s = s.trim().slice(0, maxLen);
  return s;
}

/** Strict number parse with bounds; returns fallback on garbage. */
export function sanitizeNumber(value, { min = 0, max = 100000, fallback = 0, integer = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.min(max, Math.max(min, n));
  return integer ? Math.floor(clamped) : clamped;
}

/** Allow-list check for enum-like fields (tabs, difficulty, gender…). */
export function sanitizeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

/** Validate ISO day string YYYY-MM-DD; fallback to today. */
export function sanitizeDay(value, fallbackDay) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return value;
  }
  return fallbackDay;
}

/** Validate a URL for <a href> / img src usage. Only http(s)/blob/data-image. */
export function sanitizeUrl(value) {
  const s = String(value ?? '').trim();
  if (/^(https?:\/\/|blob:|data:image\/)/i.test(s)) return s;
  return '';
}
