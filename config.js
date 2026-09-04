// ZenFit configuration
// ============================================================
// This file holds runtime configuration for the ZenFit PWA.
// It is loaded by index.html BEFORE the main script.
//
// To enable AI food recognition (Gemini), paste your API key below:
//   window.ZENFIT_CONFIG = { GEMINI_API_KEY: 'YOUR_KEY_HERE' };
//
// Get a free key at: https://aistudio.google.com/apikey
// If the key is empty, AI food recognition is gracefully skipped and
// the app falls back to the manual food-log prompt.
// ============================================================
window.ZENFIT_CONFIG = {
  GEMINI_API_KEY: ''
};
