/* ── ZenFit V2 · features/customization.js ─────────────────
   V1 customization screen, faithfully mirrored:
   background type tiles, wallpaper studio (framing grid +
   sliders + drag/pinch), DISPLAY (nav opacity, fullscreen),
   liquid glass, V1 theme engine (4 built-ins + custom
   builder + accent + import/export), bottom-nav editor.
────────────────────────────────────────────────────────────── */
import { S, update, idbPutImage, idbDeleteImage, resolveBgSrc } from '../core/store.js';
import { escapeHtml, sanitizeText } from '../core/sanitize.js';
import { showNotif, openOverlay, bgPosPercent, collapseHeader, wireCollapsibles } from '../core/ui.js';
import { THEMES, PRESET_WALLPAPERS, hexToRgb, hexToRgba, shadeColor, normalizeTheme, migrateLegacyThemes, getCustomThemes, applyThemeObject, applyTheme } from '../core/themes.js';
export { THEMES, PRESET_WALLPAPERS, hexToRgb, hexToRgba, shadeColor, normalizeTheme, migrateLegacyThemes, getCustomThemes, applyThemeObject, applyTheme };

let editingThemeId = null;

function isCollapsed(key) {
  // V1: customization sections start collapsed; only an explicit
  // `false` flag opens them.
  return S.collapsedSections?.[key] !== false ? true : false;
}

const EFFECT_LABELS = {
  dust: '✨ Constellation', snow: '❄️ Snow', sparks: '🔥 Sparks',
  firefly: '✨ Firefly', matrix: '🌧️ Matrix Rain', cyber: '⚡ Cyber Spark',
};

export function renderCustomization(host) {
  migrateLegacyThemes();

  host.innerHTML = `
  <div class="section-title">Background</div>
  <div class="card mb8">
    <div style="font-size:13px;font-weight:600;margin-bottom:8px">🖼️ Background Type</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${['solid', 'image'].map((t) => {
        const active = S.bgType === t;
        return `<button data-bgtype="${t}" style="flex:1;min-width:70px;padding:10px 8px;border-radius:10px;border:2px solid ${active ? 'var(--primary)' : 'var(--border-mid)'};background:${active ? 'var(--bg-raised)' : 'var(--bg-overlay)'};color:${active ? 'var(--primary)' : 'var(--text-primary)'};font-size:12px;font-weight:600;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px">`
          + `<span style="font-size:16px">${t === 'solid' ? '🎨' : '🖼️'}</span><span>${t === 'solid' ? '🎨 Solid' : '🖼️ Image'}</span></button>`;
      }).join('')}
    </div>
  </div>

  <div class="card mb8">
    ${collapseHeader('wallpaper-sliders', 'Wallpaper Settings', '🖼️', 'Gallery, framing & dimming', 'default-collapsed')}
    <div class="collapsible-body${isCollapsed('wallpaper-sliders') ? ' collapsed' : ''}" id="wallpaper-sliders">
      <div class="section-title mt12">Gallery</div>
      <div class="grid3" id="wp-gallery"></div>
      <div class="flex gap8 mt8" style="flex-wrap:wrap">
        <label class="btn btn-sm" style="cursor:pointer">Upload<input type="file" id="wp-upload" accept="image/*" style="display:none"></label>
        <button class="btn btn-sm btn-ghost" id="wp-clear">Remove wallpaper</button>
      </div>
      <div class="section-title mt16">Frame editor — drag to move · pinch/scroll to zoom · 0 is centered</div>
      <div class="wp-frame" id="wp-frame">
        <img class="wp-img" id="wp-img" alt="">
        <div class="wp-grid"></div>
        <div class="wp-safe"><span>content safe area</span></div>
      </div>
      <div class="mt8" id="wp-sliders">
        <label style="font-size:12px">Zoom <span id="wp-zoom-v">${S.bgZoom || 100}%</span>
          <span class="wp-stepper"><button data-step="wp-zoom:-10">−</button><input type="range" class="slider" id="wp-zoom" min="50" max="200" step="1" value="${S.bgZoom || 100}"><button data-step="wp-zoom:+10">+</button></span></label>
        <label style="font-size:12px">Position X <span id="wp-x-v">+0</span>
          <span class="wp-stepper"><button data-step="wp-x:-5">−</button><input type="range" class="slider" id="wp-x" min="-100" max="100" step="1" value="0"><button data-step="wp-x:+5">+</button></span></label>
        <label style="font-size:12px">Position Y <span id="wp-y-v">+0</span>
          <span class="wp-stepper"><button data-step="wp-y:-5">−</button><input type="range" class="slider" id="wp-y" min="-100" max="100" step="1" value="0"><button data-step="wp-y:+5">+</button></span></label>
        <label style="font-size:12px">Dim <span id="wp-dim-v">${S.bgDim ?? 40}%</span>
          <span class="wp-stepper"><button data-step="wp-dim:-5">−</button><input type="range" class="slider" id="wp-dim" min="0" max="85" step="1" value="${S.bgDim ?? 40}"><button data-step="wp-dim:+5">+</button></span></label>
        <button class="btn btn-sm btn-ghost mt8" id="wp-center">⌖ Snap to center</button>
      </div>
      <div class="flex gap8 mt8">
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">Fit</div>
        <div style="display:flex;gap:6px" id="wp-fit">
          ${['cover', 'contain', 'fill'].map((f) => `<button class="btn btn-sm${(S.bgFit || 'cover') === f ? ' btn-primary' : ''}" data-fit="${f}">${f}</button>`).join('')}
        </div>
      </div>
      <div class="flex gap8 mt8" style="font-size:11px;color:var(--text-muted)">Wallpaper applies to all screens.</div>
    </div>
  </div>

  <div class="card mb8">
    ${collapseHeader('particle-fx', 'Particle Effects', '✨', 'Count, hue, speed & direction', 'default-collapsed')}
    <div class="collapsible-body${isCollapsed('particle-fx') ? ' collapsed' : ''}" id="particle-fx">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;margin-top:12px">
          <div><div style="font-size:13px;font-weight:600">✨ Particles</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Floating particle effects</div></div>
          <label style="position:relative;display:inline-block;width:42px;height:24px;flex-shrink:0">
            <input type="checkbox" id="fx-p" ${S.particlesEnabled ? 'checked' : ''} style="opacity:0;width:0;height:0">
            <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${S.particlesEnabled ? 'var(--primary-dark)' : 'var(--bg-overlay)'};border-radius:24px;transition:.3s;border:1px solid var(--border-strong)">
            <span style="position:absolute;height:18px;width:18px;left:${S.particlesEnabled ? '20px' : '3px'};bottom:2px;background:#fff;border-radius:50%;transition:.3s"></span></span>
          </label></div>
      <div style="margin-top:10px"><div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Particle Effect</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px" id="fx-effects"></div></div>
      <div data-no-swipe style="touch-action:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border-mid)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:12px;color:var(--text-secondary)">Particle Count</span>
          <span style="font-size:12px;color:var(--primary)" id="fx-count-v">${S.particleCount || 50}</span></div>
        <input type="range" class="slider" id="fx-count" min="0" max="150" value="${S.particleCount || 50}">
      </div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-mid)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:12px;color:var(--text-secondary)">Particle Hue</span>
          <span style="font-size:12px;color:var(--primary)" id="fx-hue-v">${S.particleHue ?? 250}°</span></div>
        <input type="range" class="slider" id="fx-hue" min="0" max="360" value="${S.particleHue ?? 250}">
      </div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-mid)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:12px;color:var(--text-secondary)">Particle Speed</span>
          <span style="font-size:12px;color:var(--primary)" id="fx-speed-v">${S.particleSpeed ?? 1}x</span></div>
        <input type="range" class="slider" id="fx-speed" min="0.2" max="3" step="0.1" value="${S.particleSpeed ?? 1}">
      </div>
    </div>
  </div>

  <div class="section-title">Display</div>
  <div class="card mb8">
    <div class="flex-between"><div><div style="font-size:13px;font-weight:600">📱 Fullscreen Mode</div>
      <div style="font-size:11px;color:var(--text-muted)">Auto fullscreen on splash for phones</div></div>
      <label style="position:relative;display:inline-block;width:42px;height:24px;flex-shrink:0">
        <input type="checkbox" id="fs-auto" ${S.fullscreenAutoStart !== false ? 'checked' : ''} style="opacity:0;width:0;height:0">
        <span style="position:absolute;top:0;left:0;right:0;bottom:0;background:${S.fullscreenAutoStart !== false ? 'var(--primary-dark)' : 'var(--bg-overlay)'};border-radius:24px;border:1px solid var(--border-strong)">
        <span style="position:absolute;height:18px;width:18px;left:${S.fullscreenAutoStart !== false ? '20px' : '3px'};bottom:2px;background:#fff;border-radius:50%"></span></span>
      </label></div>
  </div>

  <div class="card mb8">
    ${collapseHeader('glass-sliders', 'Liquid Glass', '🪟', 'Frosted blur effect on cards', 'default-collapsed')}
    <div class="collapsible-body${isCollapsed('glass-sliders') ? ' collapsed' : ''}" id="glass-sliders">
      <label class="flex-between mt8" style="font-size:13px">Glass mode
        <span style="position:relative;display:inline-block;width:42px;height:24px;flex-shrink:0">
        <input type="checkbox" id="fx-glass" ${S.glassMode ? 'checked' : ''} style="opacity:0;width:0;height:0">
        <span style="position:absolute;top:0;left:0;right:0;bottom:0;background:${S.glassMode ? 'var(--primary-dark)' : 'var(--bg-overlay)'};border-radius:24px;border:1px solid var(--border-strong)">
        <span style="position:absolute;height:18px;width:18px;left:${S.glassMode ? '20px' : '3px'};bottom:2px;background:#fff;border-radius:50%"></span></span></span></label>
      <label style="font-size:12px">Blur <span id="fx-blur-v">${S.glassBlur ?? 4}px</span>
        <input type="range" class="slider" id="fx-blur" min="0" max="30" step="1" value="${S.glassBlur ?? 4}"></label>
      <div style="position:relative;height:24px;margin-bottom:8px">
        ${[0, 4, 10, 16, 22, 30].map((v) => `<div data-blurtick="${v}" style="position:absolute;left:${(v / 30) * 100}%;top:0;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer">
          <div style="width:14px;height:14px;border-radius:50%;border:2px solid ${Math.round(S.glassBlur ?? 4) === v ? 'var(--primary)' : 'var(--text-muted)'};background:${Math.round(S.glassBlur ?? 4) === v ? 'var(--primary)' : 'transparent'}"></div>
          <span style="font-size:8px;color:var(--text-muted);line-height:1">${v}</span></div>`).join('')}
      </div>
      <label style="font-size:12px">Card opacity <span id="fx-alpha-v">${Math.round((S.glassAlpha ?? 0.55) * 100)}%</span><input type="range" class="slider" id="fx-alpha" min="10" max="95" value="${Math.round((S.glassAlpha ?? 0.55) * 100)}"></label>
      <div style="position:relative;height:24px;margin-bottom:8px">
        ${[15, 30, 55, 80, 95].map((v) => `<div data-alphatick="${v}" style="position:absolute;left:${((v - 10) / 85) * 100}%;top:0;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer">
          <div style="width:14px;height:14px;border-radius:50%;border:2px solid ${Math.round((S.glassAlpha ?? 0.55) * 100) === v ? 'var(--primary)' : 'var(--text-muted)'};background:${Math.round((S.glassAlpha ?? 0.55) * 100) === v ? 'var(--primary)' : 'transparent'}"></div>
          <span style="font-size:8px;color:var(--text-muted);line-height:1">${v}</span></div>`).join('')}
      </div>
    </div>
  </div>

  <div class="section-title">Themes</div>
  <div class="card mb8">
    <div><div style="font-size:13px;font-weight:600">🎨 Themes</div>
    <div style="font-size:11px;color:var(--text-muted)">Built-in & custom color schemes</div></div>
    <div id="themes-builtin">
      <div class="section-title mt12">Built-In Themes</div>
      <div class="grid2" id="theme-grid"></div>
      <div class="section-title mt12">Custom Themes</div>
      <div id="custom-themes-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"></div>
      <div id="th-creator-home" style="display:none"></div>
      <div id="th-creator" style="display:none">
      <div class="section-title mt12">Live preview & creator</div>
      <div class="theme-preview active" id="th-live"><div class="tp-bar" id="th-live-bar">
        <div class="tp-dot" id="th-live-dot"></div><div style="font-size:12px" id="th-live-name">Preview</div></div>
        <div class="tp-body" id="th-live-body"><div class="tp-chip"></div><div class="tp-chip"></div><div class="tp-chip"></div></div></div>
      <div class="grid2 gap8 mt8">
        <label style="font-size:12px">Name<input type="text" id="th-name" placeholder="Theme name" maxlength="30"></label>
        <label style="font-size:12px">Template<select id="th-tpl"></select></label>
        <label style="font-size:12px">Wallpaper<select id="th-wp"><option value="">— keep current —</option></select></label>
        <label style="font-size:12px">Particles<select id="th-fx"><option value="">— keep current —</option><option value="dust">✨ Constellation</option><option value="snow">❄️ Snow</option><option value="sparks">🔥 Sparks</option><option value="firefly">✨ Firefly</option><option value="matrix">🌧️ Matrix Rain</option><option value="cyber">⚡ Cyber Spark</option></select></label>
      </div>
      <div class="section-title mt12">Surfaces</div>
      <div id="th-surfaces" style="display:flex;flex-direction:column;gap:8px"></div>
      <div class="section-title mt12">Text</div>
      <div id="th-texts" style="display:flex;flex-direction:column;gap:8px"></div>
      <div class="section-title mt12">Accent & glow</div>
      <div id="th-accents" style="display:flex;flex-direction:column;gap:8px"></div>
      <div class="grid2 gap8 mt8">
        <label style="font-size:12px">Particle hue (0–360)<input type="number" id="th-phue" min="0" max="360" value="250"></label>
        <label style="font-size:12px">Particle speed (0.2–3)<input type="number" id="th-pspeed" min="0.2" max="3" step="0.1" value="1"></label>
        <label style="font-size:12px">Particle count<select id="th-pcount"><option value="">— theme default —</option><option value="30">Calm (30)</option><option value="80">Normal (80)</option><option value="150">Dense (150)</option></select></label>
        <label style="font-size:12px">Wallpaper fit<select id="th-pfit"><option value="">— keep current —</option><option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Fill</option></select></label>
        <label style="font-size:12px">Glass blur (0–30px)<input type="number" id="th-blur" min="0" max="30" value="4"></label>
        <label style="font-size:12px">Card opacity (10–95%)<input type="number" id="th-alpha" min="10" max="95" value="55"></label>
      </div>
      <div class="flex gap8 mt8">
        <button class="btn btn-primary btn-sm" id="th-save">Save Custom Theme</button>
        <button class="btn btn-sm btn-ghost" id="th-try">Try live</button>
      </div>
      <div class="mt8"><label class="btn btn-sm btn-ghost" style="cursor:pointer">Import theme file<input type="file" id="th-import" accept=".json" style="display:none"></label></div>
      </div>
    </div>
  </div>
  <div class="card mb8">
    <div style="font-size:13px;font-weight:600;margin-bottom:8px">🎨 Accent Color</div>
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center" id="accent-row"></div>
      <div style="display:flex;align-items:center;gap:6px;width:100%">
        <input type="text" id="accent-hex-input" value="${escapeHtml(S.accentColor || '')}" placeholder="#7c6fff" maxlength="7" style="width:90px;padding:6px 8px;border-radius:8px;font-size:12px;font-family:monospace">
        <span style="font-size:12px;color:var(--text-secondary)" id="accent-hex">${escapeHtml(S.accentColor || 'Theme default')}</span>
        <button class="btn btn-sm" id="accent-reset" style="margin-left:auto;font-size:11px">Reset to Theme</button>
      </div></div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:6px">Overrides theme primary/glow1 without creating a full theme. Leave empty to use theme default.</div>
  </div>`;

  wireCollapsibles(host);

  host.querySelectorAll('[data-bgtype]').forEach((b) => {
    b.onclick = () => update((s) => { s.bgType = b.dataset.bgtype; });
  });

  /* gallery + upload + frame editor (V2 studio, V1 IDB storage) */
  const gal = host.querySelector('#wp-gallery');
  const allImages = [
    ...PRESET_WALLPAPERS.map((p) => ({ name: p.name, src: `preset:${p.file}`, id: `preset:${p.file}` })),
    ...(S.bgImages || []).map((w) => (typeof w === 'string' ? { name: w, src: w, id: w } : { name: w.name || 'Upload', src: w.src || w.id, id: w.id || w.src })),
  ];
  gal.innerHTML = allImages.map((w, i) => `
    <div class="theme-preview${S.bgImage === w.src ? ' active' : ''}" data-wp="${i}" style="height:84px;background:var(--bg-overlay) center/cover;position:relative" title="${escapeHtml(w.name)}">
      <img data-wpthumb="${i}" alt="" style="width:100%;height:100%;object-fit:cover;display:block" loading="lazy">
      ${w.id && !String(w.id).startsWith('preset:') && !/^data:/.test(String(w.src)) ? `<button data-wpdel="${i}" style="position:absolute;top:4px;right:4px;padding:2px 7px;font-size:10px;background:var(--danger);color:#fff;border:none;border-radius:6px">Del</button>` : ''}
    </div>`).join('');
  allImages.forEach((w, i) => {
    resolveBgSrc(w.src).then((url) => {
      const th = gal.querySelector(`[data-wpthumb="${i}"]`);
      if (th && url) th.src = url;
    });
  });
  gal.querySelectorAll('[data-wp]').forEach((t) => {
    t.onclick = (e) => {
      if (e.target.closest('[data-wpdel]')) return;
      const w = allImages[Number(t.dataset.wp)];
      update((s) => { s.bgImage = w.src; s.bgType = 'image'; s.bgScreen = s.bgScreen || 'dashboard'; });
      showNotif(`Wallpaper: ${w.name}`, 'OK');
    };
  });
  gal.querySelectorAll('[data-wpdel]').forEach((b) => {
    b.onclick = () => {
      const w = allImages[Number(b.dataset.wpdel)];
      if (w.id && !String(w.id).startsWith('preset:') && !/^data:/.test(String(w.src))) idbDeleteImage(w.id);
      update((s) => {
        s.bgImages = (s.bgImages || []).filter((x) => (x.id || x.src || x) !== w.id);
        if (s.bgImage === w.src) { s.bgImage = null; s.bgType = 'solid'; }
      });
    };
  });
  host.querySelector('#wp-upload').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { showNotif('Image too large — max 10MB', '!'); return; }
    const id = `bg_${Date.now().toString(36)}`;
    idbPutImage(id, f).then(() => {
      update((s) => {
        s.bgImages = [...(s.bgImages || []), { id, name: sanitizeText(f.name, 40) }];
        s.bgImage = id; s.bgType = 'image';
      });
      showNotif('Wallpaper uploaded', 'OK');
    });
  };
  host.querySelector('#wp-clear').onclick = () => update((s) => { s.bgImage = null; s.bgType = 'solid'; });

  const img = host.querySelector('#wp-img');
  const offVal = () => ({ x: S.bgOffX ?? 0, y: S.bgOffY ?? 0 });
  const fmtOff = (v) => `${v >= 0 ? '+' : ''}${v}`;
  const syncImg = () => {
    const cur = S.bgImage;
    if (!cur) { img.style.display = 'none'; img.removeAttribute('src'); }
    else {
      img.style.display = 'block';
      resolveBgSrc(cur).then((url) => {
        if (S.bgImage === cur && url) img.src = url;
      });
    }
    const pos = bgPosPercent();
    const z = (S.bgZoom || 100) / 100;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.maxWidth = 'none';
    img.style.objectFit = 'cover';
    img.style.objectPosition = `${pos.x}% ${pos.y}%`;
    img.style.transform = `scale(${z})`;
    img.style.transformOrigin = `${pos.x}% ${pos.y}%`;
    host.querySelector('#wp-zoom').value = S.bgZoom || 100;
    host.querySelector('#wp-x').value = offVal().x;
    host.querySelector('#wp-y').value = offVal().y;
    host.querySelector('#wp-dim').value = S.bgDim ?? 40;
    host.querySelector('#wp-zoom-v').textContent = `${S.bgZoom || 100}%`;
    host.querySelector('#wp-x-v').textContent = fmtOff(offVal().x);
    host.querySelector('#wp-y-v').textContent = fmtOff(offVal().y);
    host.querySelector('#wp-dim-v').textContent = `${S.bgDim ?? 40}%`;
  };
  syncImg();
  const set = (patch) => update((s) => Object.assign(s, patch), { silent: true });
  const setOff = (x, y) => set({
    bgOffX: Math.min(100, Math.max(-100, Math.round(x))),
    bgOffY: Math.min(100, Math.max(-100, Math.round(y))),
  });
  host.querySelectorAll('#wp-fit [data-fit]').forEach((b) => {
    b.onclick = () => { set({ bgFit: b.dataset.fit }); window.ZF.applyBg(); window.ZF.save(); window.ZF.rerender(); };
  });
  host.querySelector('#wp-zoom').oninput = (e) => { set({ bgZoom: Math.min(200, Math.max(50, Number(e.target.value))) }); syncImg(); window.ZF.applyBg(); };
  host.querySelector('#wp-x').oninput = (e) => { setOff(Number(e.target.value), offVal().y); syncImg(); window.ZF.applyBg(); };
  host.querySelector('#wp-y').oninput = (e) => { setOff(offVal().x, Number(e.target.value)); syncImg(); window.ZF.applyBg(); };
  host.querySelector('#wp-dim').oninput = (e) => { set({ bgDim: Number(e.target.value) }); window.ZF.applyBg(); syncImg(); };
  ['#wp-zoom', '#wp-x', '#wp-y', '#wp-dim'].forEach((sel) => { host.querySelector(sel).onchange = () => window.ZF.save(); });
  host.querySelectorAll('[data-step]').forEach((b) => {
    b.onclick = () => {
      const [id, delta] = b.dataset.step.split(':');
      const slider = host.querySelector(`#${id}`);
      slider.value = Math.min(+slider.max, Math.max(+slider.min, +slider.value + Number(delta)));
      slider.dispatchEvent(new Event('input'));
      slider.dispatchEvent(new Event('change'));
    };
  });
  host.querySelector('#wp-center').onclick = () => {
    setOff(0, 0);
    set({ bgZoom: 100 });
    syncImg(); window.ZF.applyBg(); window.ZF.save();
  };

  const frame = host.querySelector('#wp-frame');
  let drag = null, pinch = null;
  frame.addEventListener('pointerdown', (e) => {
    try { frame.setPointerCapture(e.pointerId); } catch {}
    if (drag?.id && e.pointerId !== drag.id && !pinch) {
      pinch = { d0: Math.hypot(e.clientX - drag.x, e.clientY - drag.y), z0: S.bgZoom || 100 };
      return;
    }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: offVal().x, oy: offVal().y };
  });
  frame.addEventListener('pointermove', (e) => {
    if (pinch && drag && e.pointerId !== drag.id) {
      const d = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
      const z = Math.min(200, Math.max(50, Math.round(pinch.z0 * (d / Math.max(1, pinch.d0)))));
      set({ bgZoom: z }); host.querySelector('#wp-zoom').value = z; syncImg(); window.ZF.applyBg();
      return;
    }
    if (drag && e.pointerId === drag.id) {
      const r = frame.getBoundingClientRect();
      const dx = ((e.clientX - drag.x) / r.width) * 100;
      const dy = ((e.clientY - drag.y) / r.height) * 100;
      setOff(drag.ox + dx, drag.oy + dy);
      syncImg(); window.ZF.applyBg();
    }
  });
  const endPointer = (e) => {
    if (pinch) pinch = null;
    if (drag?.id === e.pointerId) { drag = null; window.ZF.save(); }
  };
  frame.addEventListener('pointerup', endPointer);
  frame.addEventListener('pointercancel', endPointer);
  frame.addEventListener('wheel', (e) => {
    e.preventDefault();
    const z = Math.min(200, Math.max(50, (S.bgZoom || 100) + (e.deltaY < 0 ? 10 : -10)));
    set({ bgZoom: z }); host.querySelector('#wp-zoom').value = z; syncImg(); window.ZF.applyBg();
  }, { passive: false });

  update((s) => { s.bgAllScreens = true; }, { silent: true });

  /* particles */
  host.querySelector('#fx-p').onchange = (e) => update((s) => { s.particlesEnabled = e.target.checked; });
  const fxBox = host.querySelector('#fx-effects');
  fxBox.innerHTML = Object.entries(EFFECT_LABELS).map(([ef, label]) => {
    const active = (S.particleEffect || 'dust') === ef;
    return `<button data-fx="${ef}" style="flex:1 1 calc(50% - 3px);min-width:110px;padding:8px;border-radius:10px;border:2px solid ${active ? 'var(--primary)' : 'var(--border-mid)'};background:${active ? 'var(--bg-raised)' : 'var(--bg-overlay)'};color:${active ? 'var(--primary)' : 'var(--text-primary)'};font-size:12px;font-weight:600;cursor:pointer">${label}</button>`;
  }).join('');
  fxBox.querySelectorAll('[data-fx]').forEach((b) => {
    b.onclick = () => {
      update((s) => { s.particleEffect = b.dataset.fx; });
      if (b.dataset.fx === 'cyber') askCyberDirection();
      if (b.dataset.fx === 'sparks') askSparkDirection();
    };
  });
  host.querySelector('#fx-count').oninput = (e) => {
    host.querySelector('#fx-count-v').textContent = e.target.value;
    update((s) => { s.particleCount = Number(e.target.value); }, { silent: true });
    clearTimeout(host._fxT);
    host._fxT = setTimeout(() => window.ZF.applyBg(), 120);
  };
  host.querySelector('#fx-count').onchange = () => window.ZF.save();
  host.querySelector('#fx-hue').oninput = (e) => {
    host.querySelector('#fx-hue-v').textContent = `${e.target.value}°`;
    update((s) => { s.particleHue = Number(e.target.value); }, { silent: true });
    document.documentElement.style.setProperty('--particle-hue', String(e.target.value));
    clearTimeout(host._fxT);
    host._fxT = setTimeout(() => window.ZF.applyBg(), 120);
  };
  host.querySelector('#fx-hue').onchange = () => window.ZF.save();
  host.querySelector('#fx-speed').oninput = (e) => {
    host.querySelector('#fx-speed-v').textContent = `${Number(e.target.value).toFixed(1)}x`;
    update((s) => { s.particleSpeed = Number(e.target.value); }, { silent: true });
    clearTimeout(host._fxT);
    host._fxT = setTimeout(() => window.ZF.applyBg(), 120);
  };
  host.querySelector('#fx-speed').onchange = () => window.ZF.save();

  /* display */
  host.querySelector('#fs-auto').onchange = (e) => update((s) => { s.fullscreenAutoStart = e.target.checked; });

  /* glass */
  host.querySelector('#fx-glass').onchange = (e) => update((s) => { s.glassMode = e.target.checked; });
  host.querySelector('#fx-blur').oninput = (e) => {
    host.querySelector('#fx-blur-v').textContent = `${e.target.value}px`;
    update((s) => { s.glassBlur = Number(e.target.value); }, { silent: true });
    document.documentElement.style.setProperty('--glass-blur', `${e.target.value}px`);
  };
  host.querySelector('#fx-blur').onchange = () => window.ZF.save();
  host.querySelector('#fx-alpha').oninput = (e) => {
    host.querySelector('#fx-alpha-v').textContent = `${e.target.value}%`;
    update((s) => { s.glassAlpha = Number(e.target.value) / 100; }, { silent: true });
    document.documentElement.style.setProperty('--glass-alpha', String(Number(e.target.value) / 100));
  };
  host.querySelector('#fx-alpha').onchange = () => window.ZF.save();
  host.querySelectorAll('[data-alphatick]').forEach((t) => {
    t.onclick = () => {
      const v = Number(t.dataset.alphatick);
      host.querySelector('#fx-alpha').value = v;
      host.querySelector('#fx-alpha-v').textContent = `${v}%`;
      update((s) => { s.glassAlpha = v / 100; }, { silent: true });
      document.documentElement.style.setProperty('--glass-alpha', String(v / 100));
      window.ZF.save();
      window.ZF.rerender();
    };
  });
  host.querySelectorAll('[data-blurtick]').forEach((t) => {
    t.onclick = () => {
      const v = Number(t.dataset.blurtick);
      host.querySelector('#fx-blur').value = v;
      host.querySelector('#fx-blur-v').textContent = `${v}px`;
      update((s) => { s.glassBlur = v; }, { silent: true });
      document.documentElement.style.setProperty('--glass-blur', `${v}px`);
      window.ZF.save();
      window.ZF.rerender();
    };
  });

  /* built-in themes */
  const grid = host.querySelector('#theme-grid');
  grid.innerHTML = Object.entries(THEMES).map(([id, t]) => {
    const active = S.theme === id;
    return `<div class="theme-preview${active ? ' active' : ''}" data-theme="${id}" style="background:${t.bgSurface};padding:10px 12px;border-radius:10px">
      <div style="display:flex;gap:6px;margin-bottom:6px">
        <div style="width:14px;height:14px;border-radius:50%;background:${t.bgBase};border:1px solid var(--border-mid)"></div>
        <div style="width:14px;height:14px;border-radius:50%;background:${t.primary}"></div>
        <div style="width:14px;height:14px;border-radius:50%;background:${t.textMuted}"></div></div>
      <div style="font-size:12px;font-weight:600;color:${t.textPrimary}">${escapeHtml(t.name)}</div>
      ${active ? `<div style="font-size:10px;color:${t.primary};margin-top:2px">Active</div>` : ''}</div>`;
  }).join('');
  grid.querySelectorAll('[data-theme]').forEach((c) => {
    c.onclick = () => { applyTheme(c.dataset.theme); showNotif(`Theme "${THEMES[c.dataset.theme].name}" applied`, 'OK'); };
  });

  /* custom themes */
  const mine = host.querySelector('#custom-themes-grid');
  const drawMine = () => {
    const customs = getCustomThemes();
    mine.innerHTML = customs.map((t) => `
      <div style="position:relative;cursor:pointer;padding:10px 12px;border-radius:10px;border:2px solid ${S.theme === `custom:${t.id}` ? 'var(--primary)' : 'var(--border-mid)'};background:${t.bgSurface}" data-ctheme="${t.id}">
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <div style="width:14px;height:14px;border-radius:50%;background:${t.bgBase}"></div>
          <div style="width:14px;height:14px;border-radius:50%;background:${t.primary}"></div>
          <div style="width:14px;height:14px;border-radius:50%;background:${t.textMuted}"></div></div>
        <div style="font-size:12px;font-weight:600;color:${t.textPrimary}">${escapeHtml(t.name)}</div>
        ${S.theme === `custom:${t.id}` ? `<div style="font-size:10px;color:${t.primary};margin-top:2px">Active</div>` : ''}
        <button data-thact="${t.id}" style="position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:50%;background:var(--bg-overlay);border:1px solid var(--border-mid);color:var(--text-secondary);font-size:12px;font-style:italic;cursor:pointer" title="Theme actions">i</button>
      </div>`).join('')
      + `<div data-ctnew style="cursor:pointer;padding:10px 12px;border-radius:10px;border:2px dashed var(--border-mid);text-align:center;min-height:80px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
        <div style="font-size:28px;color:var(--text-muted)">+</div>
        <div style="font-size:12px;font-weight:600;color:var(--text-muted)">Create Theme</div></div>`;
    mine.querySelectorAll('[data-ctheme]').forEach((c) => {
      c.onclick = (e) => {
        if (e.target.closest('[data-thact]')) return;
        applyTheme(`custom:${c.dataset.ctheme}`);
        showNotif('Custom theme applied', 'OK');
      };
    });
    mine.querySelectorAll('[data-thact]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        themeActions(b.dataset.thact);
      };
    });
    const nw = mine.querySelector('[data-ctnew]');
    if (nw) nw.onclick = () => showThemeBuilder();
  };
  drawMine();

  /* creator live preview */
  const tpl = document.querySelector('#th-tpl');
  const tplOpts = [...Object.entries(THEMES).map(([id, t]) => [`built:${id}`, t.name]), ...getCustomThemes().map((t) => [`custom:${t.id}`, `${t.name} (custom)`])];
  tpl.innerHTML = tplOpts.map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join('');
  const wpSel = document.querySelector('#th-wp');
  try {
    const imgs = [...PRESET_WALLPAPERS.map((p) => ({ name: p.name, src: `preset:${p.file}` })), ...(S.bgImages || []).map((w) => (typeof w === 'string' ? { name: w, src: w } : { name: w.name || 'Upload', src: w.src || w.id }))];
    wpSel.innerHTML = '<option value="">— keep current —</option>' + imgs.map((w) => `<option value="${escapeHtml(w.src)}">${escapeHtml(w.name)}</option>`).join('');
  } catch {}
  const TH_FIELDS = [
    { sec: 'surfaces', key: 'bgBase', label: 'Background' },
    { sec: 'surfaces', key: 'bgSurface', label: 'Surface' },
    { sec: 'surfaces', key: 'bgRaised', label: 'Raised' },
    { sec: 'surfaces', key: 'bgOverlay', label: 'Overlay' },
    { sec: 'surfaces', key: 'borderMid', label: 'Border' },
    { sec: 'surfaces', key: 'inputBg', label: 'Input bg' },
    { sec: 'texts', key: 'textPrimary', label: 'Text primary' },
    { sec: 'texts', key: 'textSecondary', label: 'Text secondary' },
    { sec: 'texts', key: 'textMuted', label: 'Text muted' },
    { sec: 'accents', key: 'primary', label: 'Primary' },
    { sec: 'accents', key: 'glow1', label: 'Glow 1' },
    { sec: 'accents', key: 'glow2', label: 'Glow 2' },
    { sec: 'accents', key: 'glow3', label: 'Glow 3' },
  ];
  const thVal = (id) => host.querySelector(`#th-c-${id}`)?.value;
  const buildRows = () => {
    const groups = { surfaces: document.querySelector('#th-surfaces'), texts: document.querySelector('#th-texts'), accents: document.querySelector('#th-accents') };
    for (const { sec, key, label } of TH_FIELDS) {
      const wrap = groups[sec];
      if (!wrap || wrap.querySelector(`#th-c-${key}`)) continue;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px';
      row.innerHTML = `<span style="font-size:12px;min-width:110px">${label}</span>
        <input type="color" id="th-c-${key}" value="#7b5eff" style="width:40px;height:32px;padding:2px;flex-shrink:0">
        <input type="text" id="th-c-${key}-hex" maxlength="7" placeholder="#RRGGBB" style="flex:1;font-family:monospace" >`;
      wrap.appendChild(row);
      const picker = row.querySelector(`#th-c-${key}`);
      const hex = row.querySelector(`#th-c-${key}-hex`);
      picker.oninput = () => { hex.value = picker.value; live(); };
      hex.oninput = () => { if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) { picker.value = hex.value; live(); } };
    }
    ['surfaces', 'texts', 'accents'].forEach((s) => { const w = host.querySelector(`#th-${s}`); if (w) w.dataset.built = '1'; });
  };
  buildRows();
  const live = () => {
    const [kind, key] = (tpl.value || 'built:midnight').split(':');
    const base = kind === 'custom'
      ? normalizeTheme(getCustomThemes().find((x) => x.id === key) || THEMES.midnight)
      : THEMES[key] || THEMES.midnight;
    const draft = {
      ...base,
      name: document.querySelector('#th-name').value || 'Preview',
      p_hue: document.querySelector('#th-phue')?.value || base.p_hue,
      particleSpeed: Math.min(3, Math.max(0.2, Number(document.querySelector('#th-pspeed')?.value) || 1)),
      particleCount: [30, 80, 150].includes(Number(document.querySelector('#th-pcount')?.value)) ? Number(document.querySelector('#th-pcount').value) : null,
      bgFit: ['cover', 'contain', 'fill'].includes(document.querySelector('#th-pfit')?.value) ? document.querySelector('#th-pfit').value : null,
      glassBlur: Math.min(30, Math.max(0, Number(document.querySelector('#th-blur')?.value ?? 4))),
      glassAlpha: Math.min(0.95, Math.max(0.1, (Number(document.querySelector('#th-alpha')?.value ?? 55)) / 100)),
    };
    for (const { key: k } of TH_FIELDS) {
      const v = thVal(k);
      if (v) draft[k] = v;
    }
    const box = document.querySelector('#th-live');
    box.querySelector('#th-live-bar').style.background = draft.bgSurface;
    box.querySelector('#th-live-dot').style.background = draft.primary;
    box.querySelector('#th-live-body').style.background = draft.bgBase;
    box.querySelector('#th-live-name').textContent = draft.name;
    box.querySelector('#th-live-name').style.color = draft.textPrimary;
    const chips = box.querySelectorAll('.tp-chip');
    if (chips[0]) chips[0].style.background = draft.primary;
    if (chips[1]) chips[1].style.background = draft.bgRaised;
    if (chips[2]) { chips[2].style.background = draft.bgSurface; chips[2].style.border = `1px solid ${draft.primary}`; }
    return draft;
  };
  const syncFromTemplate = () => {
    const [kind, key] = (tpl.value || 'built:midnight').split(':');
    const base = kind === 'custom'
      ? normalizeTheme(getCustomThemes().find((x) => x.id === key) || THEMES.midnight)
      : THEMES[key] || THEMES.midnight;
    for (const { key: k } of TH_FIELDS) {
      const picker = host.querySelector(`#th-c-${k}`);
      const hex = host.querySelector(`#th-c-${k}-hex`);
      if (picker && base[k]) picker.value = base[k];
      if (hex && base[k]) hex.value = base[k];
    }
    const ph = document.querySelector('#th-phue');
    if (ph) ph.value = base.p_hue || 250;
    const ps = document.querySelector('#th-pspeed');
    if (ps) ps.value = base.particleSpeed || 1;
    const bl = document.querySelector('#th-blur');
    if (bl) bl.value = base.glassBlur ?? 4;
    const al = document.querySelector('#th-alpha');
    if (al) al.value = Math.round((base.glassAlpha ?? 0.55) * 100);
    const pc = document.querySelector('#th-pcount');
    if (pc) pc.value = [30, 80, 150].includes(Number(base.particleCount)) ? String(base.particleCount) : '';
    const pf = document.querySelector('#th-pfit');
    if (pf) pf.value = ['cover', 'contain', 'fill'].includes(base.bgFit) ? base.bgFit : '';
    live();
  };
  document.querySelector('#th-name').oninput = live;
  document.querySelector('#th-phue').oninput = live;
  document.querySelector('#th-pspeed').oninput = live;
  document.querySelector('#th-blur').oninput = live;
  document.querySelector('#th-alpha').oninput = live;
  tpl.onchange = syncFromTemplate;
  syncFromTemplate();
  document.querySelector('#th-save').onclick = () => {
    const draft = live();
    const name = sanitizeText(document.querySelector('#th-name').value, 30);
    if (!name) { showNotif('Name your theme', '!'); return; }
    if (editingThemeId) {
      const clash = getCustomThemes().some((t) => t.name === name && t.id !== editingThemeId);
      if (clash) { showNotif(`"${name}" already exists`, '!'); return; }
      const eid = editingThemeId;
      editingThemeId = null;
      update((s) => { s.customThemes = (s.customThemes || []).map((t) => t.id === eid ? { ...t, ...draft, id: eid, name } : t); });
      showNotif(`Theme "${name}" updated!`, 'OK');
      window.ZF.rerender();
      return;
    }
    if (getCustomThemes().some((t) => t.name === name)) { showNotif(`"${name}" already exists`, '!'); return; }
    const [kind, key] = (tpl.value || 'built:midnight').split(':');
    const base = kind === 'custom'
      ? normalizeTheme(getCustomThemes().find((x) => x.id === key) || THEMES.midnight)
      : { ...THEMES[key] };
    const t = { ...base, ...draft, id: `ct_${Date.now()}`, name };
    try {
      const wp = document.querySelector('#th-wp')?.value || '';
      const fx = document.querySelector('#th-fx')?.value || '';
      if (wp) { t.bgImage = wp; t.bgType = 'image'; }
      if (fx) { t.particleEffect = fx; t.p_hue = t.p_hue || draft.p_hue; }
    } catch {}
    update((s) => { s.customThemes = [...(s.customThemes || []), t]; });
    showNotif(`Theme "${name}" created!`, 'OK');
  };
  document.querySelector('#th-try').onclick = () => {
    const draft = live();
    applyThemeObject({ ...draft, name: 'Preview' }, S.theme);
    showNotif('Previewing — pick a theme to keep it', 'OK');
  };
  document.querySelector('#th-import').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const t = JSON.parse(r.result);
        if (!t.name || !t.primary) throw new Error('bad theme');
        t.id = `ct_${Date.now()}`;
        update((s) => { s.customThemes = [...(s.customThemes || []), normalizeTheme(t)]; });
        showNotif(`Theme "${t.name}" imported!`, 'OK');
      } catch { showNotif('Invalid theme file', '!'); }
    };
    r.readAsText(f);
  };

  function themeActions(id) {
    const t = getCustomThemes().find((x) => x.id === id);
    if (!t) return;
    openOverlay(`<div style="font-size:15px;font-weight:700;margin-bottom:12px">${escapeHtml(t.name)}</div>
      <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn btn-primary" id="tha-edit">Edit theme</button>
      <button class="btn" id="tha-dup">Duplicate</button>
      <button class="btn" id="tha-export">Export theme file</button>
      <button class="btn btn-danger" id="tha-del">Delete theme</button>
      <button class="btn btn-ghost" id="tha-x">Cancel</button></div>`);
    document.getElementById('tha-x').onclick = () => document.getElementById('zf-overlay')?.remove();
    document.getElementById('tha-edit').onclick = () => {
      document.getElementById('zf-overlay')?.remove();
      editingThemeId = id;
      showThemeBuilder();
      const src = getCustomThemes().find((x) => x.id === id) || {};
      document.querySelector('#th-name').value = src.name || '';
      document.querySelector('#th-tpl').value = `custom:${id}`;
      syncFromTemplate();
      if (src.bgImage) { const w = document.querySelector('#th-wp'); if (w) w.value = src.bgImage; }
      if (src.particleEffect) { const f = document.querySelector('#th-fx'); if (f) f.value = src.particleEffect; }
    };
    document.getElementById('tha-dup').onclick = () => {
      const copy = { ...t, id: `ct_${Date.now()}`, name: `${t.name} (copy)`.slice(0, 30) };
      update((s) => { s.customThemes = [...(s.customThemes || []), copy]; });
      document.getElementById('zf-overlay')?.remove();
      showNotif(`Theme "${copy.name}" created!`, 'OK');
    };
    document.getElementById('tha-del').onclick = () => {
      update((s) => { s.customThemes = (s.customThemes || []).filter((x) => x.id !== id); });
      document.getElementById('zf-overlay')?.remove();
    };
    document.getElementById('tha-export').onclick = () => {
      const blob = new Blob([JSON.stringify(t, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `zenfit-theme-${t.name.replace(/[^a-z0-9_-]/gi, '_')}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      document.getElementById('zf-overlay')?.remove();
      showNotif(`Theme "${t.name}" exported!`, 'OK');
    };
  }

  function showThemeBuilder() {
    const creator = document.querySelector('#th-creator');
    if (!creator) return;
    const isEdit = !!editingThemeId;
    openOverlay(`<div style="font-size:15px;font-weight:700;margin-bottom:8px">${isEdit ? 'Edit Custom Theme' : 'Create Custom Theme'}</div><div id="th-dialog-slot"></div><button class="btn btn-ghost btn-sm mt8" id="th-dialog-close">Close</button>`);
    document.querySelector('#zf-overlay .overlay-box')?.classList.add('overlay-wide');
    const slot = document.querySelector('#th-dialog-slot');
    if (slot) { slot.appendChild(creator); creator.style.display = 'block'; }
    document.getElementById('th-dialog-close').onclick = () => {
      editingThemeId = null;
      const creatorEl = document.querySelector('#th-creator');
      const home = document.querySelector('#th-creator-home');
      if (creatorEl && home) { home.appendChild(creatorEl); creatorEl.style.display = 'none'; }
      document.getElementById('zf-overlay')?.remove();
    };
    setTimeout(() => document.querySelector('#th-name')?.focus(), 100);
  }

  /* accent */
  const ACCENTS = ['#7c6fff', '#4a9eff', '#00d4ff', '#4cdb8a', '#f5a623', '#ff5a5a', '#ff6bff', '#c084fc', '#ff8c42', '#ffffff'];
  const arow = host.querySelector('#accent-row');
  arow.innerHTML = ACCENTS.map((c) => {
    const active = (S.accentColor || '').toLowerCase() === c;
    return `<div data-accent="${c}" title="${c}" style="width:26px;height:26px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${active ? 'var(--text-primary)' : 'var(--border-mid)'};box-shadow:${active ? '0 0 0 2px var(--primary)' : 'none'};flex-shrink:0"></div>`;
  }).join('') + `<input type="color" id="accent-picker" value="${escapeHtml(S.accentColor || '#7c6fff')}" style="width:30px;height:30px;border:none;border-radius:50%;cursor:pointer;background:none;padding:0" title="Custom color">`;
  arow.querySelectorAll('[data-accent]').forEach((d) => { d.onclick = () => setAccent(d.dataset.accent); });
  arow.querySelector('#accent-picker').onchange = (e) => setAccent(e.target.value);
  function setAccent(c) {
    update((s) => { s.accentColor = sanitizeText(c, 20); }, { silent: true });
    document.documentElement.style.setProperty('--primary', c);
    document.documentElement.style.setProperty('--primary-rgb', hexToRgb(c));
    document.documentElement.style.setProperty('--glow1', c);
    window.ZF.save();
    window.ZF.rerender();
  }
  host.querySelector('#accent-hex-input').onchange = (e) => {
    const v = sanitizeText(e.target.value, 20).trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) setAccent(v);
    else showNotif('Use #rrggbb format', '!');
  };
  host.querySelector('#accent-reset').onclick = () => {
    update((s) => { s.accentColor = ''; }, { silent: true });
    window.ZF.save();
    const cur = S.theme?.startsWith('custom:') ? null : THEMES[S.theme];
    if (cur) applyThemeObject(cur, S.theme);
    else window.ZF.rerender();
  };
}

function askSparkDirection() {
  openOverlay(`<div style="font-size:15px;font-weight:700;margin-bottom:4px">🔥 Sparks direction</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Straight rises vertically like embers. Diagonal slants with the wind.</div>
    <div style="display:flex;gap:8px;justify-content:center">
      <button class="btn ${S.sparkDirection !== 'diagonal' ? 'btn-primary' : ''}" id="sp-straight">Straight</button>
      <button class="btn ${S.sparkDirection === 'diagonal' ? 'btn-primary' : ''}" id="sp-diag">Diagonal</button></div>`);
  const pick = (dir) => {
    update((s) => { s.sparkDirection = dir; });
    document.getElementById('zf-overlay')?.remove();
    showNotif(`Sparks: ${dir}`, 'OK');
  };
  document.getElementById('sp-straight').onclick = () => pick('straight');
  document.getElementById('sp-diag').onclick = () => pick('diagonal');
}

function askCyberDirection() {
  openOverlay(`<div style="font-size:15px;font-weight:700;margin-bottom:4px">⚡ Cyber Spark direction</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Straight falls vertically (V1 neon rain). Diagonal drifts like before.</div>
    <div style="display:flex;gap:8px;justify-content:center">
      <button class="btn ${S.cyberDirection !== 'diagonal' ? 'btn-primary' : ''}" id="cy-straight">Straight</button>
      <button class="btn ${S.cyberDirection === 'diagonal' ? 'btn-primary' : ''}" id="cy-diag">Diagonal</button></div>`);
  const pick = (dir) => {
    update((s) => { s.cyberDirection = dir; });
    document.getElementById('zf-overlay')?.remove();
    showNotif(`Cyber Spark: ${dir}`, 'OK');
  };
  document.getElementById('cy-straight').onclick = () => pick('straight');
  document.getElementById('cy-diag').onclick = () => pick('diagonal');
}

