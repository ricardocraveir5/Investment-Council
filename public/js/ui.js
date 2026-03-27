import { ADVISORS } from './advisors.js';

export function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatText(s) {
  let t = esc(s);
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e0e0e0">$1</strong>');
  t = t.replace(/\n/g, "<br>");
  return t;
}

export function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + "d ago";
  return new Date(ts).toLocaleDateString();
}

export function renderMessages(messages, el) {
  if (!messages.length) return;
  let h = "";
  for (const e of messages) {
    if (e.t === "u") {
      h += `<div class="mu"><div style="max-width:82%">`;
      if (e.tgts && e.tgts.length > 1) h += `<div class="mt">${e.tgts.map(t => {
        const a = ADVISORS[t];
        return a ? `<span class="tg" style="background:${a.c}20;color:${a.c}">${a.i} ${a.s}</span>` : "";
      }).join("")}</div>`;
      h += `<div class="mb">${esc(e.x)}</div></div></div>`;
    }
    if (e.t === "r") {
      h += `<div style="margin-bottom:18px;max-width:92%">`;
      if (e.fc) h += `<div class="fb">🔬 Financial data pulled${e.tk ? " for " + e.tk : ""}</div>`;
      for (const [k, v] of Object.entries(e.d)) {
        const a = ADVISORS[k];
        if (!a) continue;
        h += `<div class="cd" style="border-color:${v.e ? "#7A3A3A" : a.c + "30"}"><div class="ch"><div class="ci" style="background:${a.g}">${a.i}</div><span class="cn" style="color:${v.e ? "#C87070" : a.c}">${a.n}</span>${v.e ? '<span class="ce">ERROR</span>' : ""}</div>`;
        if (v.l) h += `<div class="dots"><div class="dot" style="background:${a.c}"></div><div class="dot" style="background:${a.c};animation-delay:.2s"></div><div class="dot" style="background:${a.c};animation-delay:.4s"></div></div>`;
        else h += `<div class="ct${v.e ? " err" : ""}">${formatText(v.x)}</div>`;
        h += `</div>`;
      }
      h += `</div>`;
    }
  }
  el.innerHTML = h;
  setTimeout(() => { el.scrollTop = el.scrollHeight; }, 50);
}

export function renderWelcome(advisorKeys, suggested, onQuery) {
  const legends = advisorKeys.filter(k => ADVISORS[k].cat === "legends");
  const specialists = advisorKeys.filter(k => ADVISORS[k].cat === "specialists");

  let h = `<div class="wel">`;
  h += `<div style="text-align:center;margin-bottom:4px"><span style="font-size:28px">🏛️</span><div style="font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:#e8e8e8;margin-top:6px">Investment Council</div><div style="font-size:12px;color:#666;margin-top:2px">10 AI minds + financial data</div></div>`;

  h += `<div style="width:100%;max-width:540px"><div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;padding-left:4px">Legends</div><div class="ar">`;
  legends.forEach(k => {
    const a = ADVISORS[k];
    h += `<div class="ac" style="border:1px solid ${a.c}25"><div class="aci" style="background:${a.g}">${a.i}</div><div class="an">${a.n}</div><div class="ad">${a.d}</div></div>`;
  });
  h += `</div></div>`;

  h += `<div style="width:100%;max-width:540px"><div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;padding-left:4px">Specialists</div><div class="ar">`;
  specialists.forEach(k => {
    const a = ADVISORS[k];
    h += `<div class="ac" style="border:1px solid ${a.c}25"><div class="aci" style="background:${a.g}">${a.i}</div><div class="an">${a.n}</div><div class="ad">${a.d}</div></div>`;
  });
  h += `</div></div>`;

  h += `<div class="hint">💡 Mention a ticker like <strong>$AAPL</strong> or <strong>$TSM</strong> to auto-pull financial data</div>`;
  h += `<div class="sg">${suggested.map(q => `<button class="sb" data-q="${esc(q)}">${q}</button>`).join("")}</div>`;
  h += `</div>`;
  return h;
}
