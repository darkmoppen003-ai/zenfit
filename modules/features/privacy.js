/* ── ZenFit V2 · features/privacy.js ─────────────────────
   Hidden privacy-policy screen (Profile → button, no nav entry).
   Renders the repo-root privacy-policy.md with a tiny renderer —
   precached for offline. No scripts execute from the markdown.
────────────────────────────────────────────────────────────── */
import { escapeHtml } from '../core/sanitize.js';

function mdInline(s) {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="font-size:11px;background:var(--bg-overlay);padding:1px 5px;border-radius:5px">$1</code>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--info)">$1</a>');
}

function mdToHtml(md) {
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  let html = '', inList = false, table = null;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  const closeTable = () => {
    if (!table) return;
    html += '<div style="overflow-x:auto"><table style="width:100%;font-size:12px;border-collapse:collapse;margin:8px 0">'
      + table.map((row, i) => `<tr>${row.map((c) => `<t${i === 0 ? 'h' : 'd'} style="border:1px solid var(--border-mid);padding:6px 8px;text-align:left;${i === 0 ? 'background:var(--bg-overlay)' : ''}">${mdInline(c)}</t${i === 0 ? 'h' : 'd'}>`).join('')}</tr>`).join('')
      + '</table></div>';
    table = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (/^\|.*\|$/.test(line)) {
      closeList();
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (/^:?-+:?$/.test(cells.filter(Boolean).join(''))) continue;
      if (!table) table = [];
      table.push(cells);
      continue;
    }
    closeTable();
    if (!line) { closeList(); continue; }
    if (line.startsWith('### ')) { closeList(); html += `<h4 style="font-size:14px;margin:14px 0 6px">${mdInline(line.slice(4))}</h4>`; continue; }
    if (line.startsWith('## ')) { closeList(); html += `<h3 style="font-size:15px;margin:16px 0 6px">${mdInline(line.slice(3))}</h3>`; continue; }
    if (line.startsWith('# ')) { closeList(); html += `<h2 style="font-size:18px;font-family:var(--font-display);margin:4px 0 8px">${mdInline(line.slice(2))}</h2>`; continue; }
    if (/^---+$/.test(line)) { closeList(); html += '<hr style="border:none;border-top:1px solid var(--border-mid);margin:14px 0">'; continue; }
    if (/^[-*] /.test(line)) {
      if (!inList) { html += '<ul style="margin:4px 0 10px;padding-left:20px;font-size:12px;color:var(--text-secondary);line-height:1.65">'; inList = true; }
      html += `<li>${mdInline(line.slice(2))}</li>`;
      continue;
    }
    closeList();
    html += `<p style="font-size:12px;color:var(--text-secondary);line-height:1.7;margin:0 0 8px">${mdInline(line)}</p>`;
  }
  closeList(); closeTable();
  return html;
}

export function renderPrivacy(host) {
  host.innerHTML = `<button class="btn btn-sm btn-ghost mb12" id="prv-back">← Back to profile</button>
  <div class="card" id="prv-body"><div style="font-size:12px;color:var(--text-muted)">Loading privacy policy…</div></div>`;
  host.querySelector('#prv-back').onclick = () => window.ZF.go('profile');
  fetch('./privacy-policy.md', { cache: 'force-cache' })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
    .then((md) => {
      const body = host.querySelector('#prv-body');
      if (body) body.innerHTML = mdToHtml(md);
    })
    .catch(() => {
      const body = host.querySelector('#prv-body');
      if (body) body.innerHTML = '<div style="font-size:13px">Could not load the privacy policy offline. Your data stays on this device regardless — nothing is uploaded by default.</div>';
    });
}
