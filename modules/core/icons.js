/* ── ZenFit V2 · core/icons.js ─────────────────────────────
   Separate SVG icon set (stroke style, 24-grid). UI chrome uses
   ONLY these. Emoji remain only for V1 content faces
   (quest/mood/achievement) and user text.
────────────────────────────────────────────────────────────── */

const SW = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS = {
  dashboard: `<svg ${SW}><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>`,
  nutrition: `<svg ${SW}><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
  meal: `<svg ${SW}><path d="M4 12h16a1 1 0 0 1 1 1 7 7 0 0 1-7 7H8a7 7 0 0 1-7-7 1 1 0 0 1 1-1z"/><path d="M9 12V5a2 2 0 0 1 4 0"/></svg>`,
  water: `<svg ${SW}><path d="M12 3C7 8 5 12 5 16a7 7 0 0 0 14 0C19 12 17 8 12 3z"/></svg>`,
  drop: `<svg ${SW}><path d="M12 3C7 8 5 12 5 16a7 7 0 0 0 14 0C19 12 17 8 12 3z"/></svg>`,
  workout: `<svg ${SW}><path d="M6.5 6.5 17.5 17.5"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="M14 5h7v7"/><path d="M3 10v11h11"/></svg>`,
  dumbbell: `<svg ${SW}><path d="M6.5 6.5 17.5 17.5"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/></svg>`,
  flame: `<svg ${SW}><path d="M12 22c4 0 7-2.7 7-7 0-3-2-5.5-3.5-7C14 6.5 13 5 13 2c-3 2-5 4.5-5 7-1-1-1.5-2-2-3.5C4.7 7 5 9 5 11c0 2 1 3.5 2 5-.5 0-1.5-.5-2-1 0 3 3 7 7 7z"/></svg>`,
  habits: `<svg ${SW}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  checkSquare: `<svg ${SW}><rect x="3" y="3" width="18" height="18" rx="4"/><polyline points="8.5 12.5 11 15 15.5 9.5"/></svg>`,
  tasks: `<svg ${SW}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  mind: `<svg ${SW}><path d="M12 2a7 7 0 0 1 7 7c0 2.4-1 4-2.5 5.5A7 7 0 0 1 12 22"/><path d="M12 2a7 7 0 0 0-7 7c0 2.4 1 4 2.5 5.5A7 7 0 0 0 12 22"/><circle cx="12" cy="9" r="2"/></svg>`,
  lotus: `<svg ${SW}><path d="M12 20c-4 0-7-2-8.5-5C6 14 9 13 12 13s6 1 8.5 2c-1.5 3-4.5 5-8.5 5z"/><path d="M12 13c0-4 1-7 3-9 2 2 3 5 3 9"/><path d="M12 13c0-4-1-7-3-9-2 2-3 5-3 9"/></svg>`,
  quests: `<svg ${SW}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  star: `<svg ${SW}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  analytics: `<svg ${SW}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  chart: `<svg ${SW}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  leaderboard: `<svg ${SW}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 9 7 9"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 9 17 9"/><path d="M4 22h16"/><path d="M10 22V8h4v14"/></svg>`,
  trophy: `<svg ${SW}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 9 7 9"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 9 17 9"/><path d="M4 22h16"/><path d="M10 22V8h4v14"/></svg>`,
  profile: `<svg ${SW}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  user: `<svg ${SW}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  customization: `<svg ${SW}><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
  sliders: `<svg ${SW}><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
  more: `<svg ${SW}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`,
  menu: `<svg ${SW}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  shield: `<svg ${SW}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  shieldCheck: `<svg ${SW}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 11.5 11 13.5 15 9.5"/></svg>`,
  steps: `<svg ${SW}><path d="M4 16v-2.4C4 11 6 9.5 9 9.5s5 1.5 5 4V16"/><path d="M4 16h5"/><path d="M15 8V5.6C15 3.4 17 2 20 2s5 1.4 5 3.6V8"/><path d="M15 8h5"/></svg>`,
  moon: `<svg ${SW}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  scale: `<svg ${SW}><path d="M12 3v18"/><path d="M5 7l7-4 7 4"/><path d="M3 13l2-6 2 6a3.5 3.5 0 0 1-4 0z"/><path d="M17 13l2-6 2 6a3.5 3.5 0 0 1-4 0z"/></svg>`,
  plus: `<svg ${SW}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  check: `<svg ${SW}><polyline points="20 6 9 17 4 12"/></svg>`,
  bell: `<svg ${SW}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>`,
  book: `<svg ${SW}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  camera: `<svg ${SW}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  image: `<svg ${SW}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  gear: `<svg ${SW}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  zap: `<svg ${SW}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  target: `<svg ${SW}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>`,
  clock: `<svg ${SW}><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>`,
  x: `<svg ${SW}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  chevDown: `<svg ${SW}><polyline points="6 9 12 15 18 9"/></svg>`,
  crown: `<svg ${SW}><path d="M3 17l1.5-9L9 12l3-7 3 7 4.5-4L21 17z"/><path d="M4 21h16"/></svg>`,
  swords: `<svg ${SW}><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="20" x2="20" y2="16"/><polyline points="9.5 6.5 18 3 21 3 21 6 17.5 14.5"/><line x1="5" y1="11" x2="11" y2="5"/><line x1="4" y1="8" x2="8" y2="4"/></svg>`,
  shieldRank: `<svg ${SW}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 15h.01"/></svg>`,
  bow: `<svg ${SW}><path d="M7 3c-3 4-3 14 0 18"/><path d="M7 3c4 1 7 5 7 9s-3 8-7 9"/><line x1="7" y1="12" x2="21" y2="12"/><polyline points="18 9 21 12 18 15"/></svg>`,
  dagger: `<svg ${SW}><path d="M4 20l2-2"/><path d="M6 18L18 6l-3-3L3 15l3 3z"/><path d="M15 5l4 4"/><path d="M3 21l3-3"/></svg>`,
  fist: `<svg ${SW}><path d="M7 11V6a2 2 0 0 1 4 0v4"/><path d="M11 10V4.5a2 2 0 0 1 4 0V10"/><path d="M15 10V6.5a2 2 0 0 1 4 0V13"/><path d="M7 11l-1.5 1A2.5 2.5 0 0 0 9 16h7a4 4 0 0 0 4-4v-3a2 2 0 0 0-4 0"/></svg>`,
  cloche: `<svg ${SW}><path d="M4 17h16"/><path d="M12 7a8 8 0 0 1 8 8H4a8 8 0 0 1 8-8z"/><line x1="12" y1="7" x2="12" y2="4"/><circle cx="12" cy="4" r="1"/></svg>`,
  inbox: `<svg ${SW}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="12" y1="8" x2="12" y2="12"/><polyline points="9.5 10.5 12 12.5 14.5 10.5"/></svg>`,
};

/** Render an icon by name. Extra class hooks sizing. */
export function icon(name, cls = '') {
  const svg = ICONS[name] || ICONS.star;
  return cls ? svg.replace('<svg ', `<svg class="${cls}" `) : svg;
}
