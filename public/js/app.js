import { ADVISORS, ADVISOR_KEYS, SUGGESTED } from './advisors.js';
import { getSelectedAdvisors, setSelectedAdvisors, getConversation, saveConversation, newConversation, getCurrentConversationId, setCurrentConversationId } from './storage.js';
import { detectTicker, streamAdvisors, askAdvisors } from './api.js';
import { renderMessages, renderWelcome, esc, formatText } from './ui.js';
import { initSidebar, renderConversationList } from './sidebar.js';
import { initPortfolio, renderPortfolio } from './portfolio.js';

let currentConv = null;
let busy = false;
let currentView = "council";
let activeStream = null;

const $ = id => document.getElementById(id);

function init() {
  loadOrNewConversation();
  renderAdvisorChips();
  renderView();
  updateSendButton();

  $("inp").addEventListener("input", updateSendButton);
  $("inp").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) go(); });
  $("cb").addEventListener("click", clearChat);
  $("all-toggle").addEventListener("click", toggleAll);

  $("msgs").addEventListener("click", e => {
    const btn = e.target.closest(".sb");
    if (btn && btn.dataset.q) go(btn.dataset.q);
  });

  $("nav-council").addEventListener("click", () => switchView("council"));
  $("nav-portfolio").addEventListener("click", () => switchView("portfolio"));

  initSidebar({ onNewChat: startNewChat, onLoadChat: loadChat });
  initPortfolio();
  renderConversationList(loadChat);

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

function switchView(view) {
  currentView = view;
  $("nav-council").classList.toggle("nav-active", view === "council");
  $("nav-portfolio").classList.toggle("nav-active", view === "portfolio");
  $("council-view").style.display = view === "council" ? "flex" : "none";
  $("portfolio-view").style.display = view === "portfolio" ? "flex" : "none";
  if (view === "portfolio") renderPortfolio();
}

function loadOrNewConversation() {
  const id = getCurrentConversationId();
  if (id) {
    const conv = getConversation(id);
    if (conv) { currentConv = conv; return; }
  }
  currentConv = newConversation();
}

function startNewChat() {
  if (activeStream) { activeStream.abort(); activeStream = null; }
  currentConv = newConversation();
  $("cb").style.display = "none";
  renderView();
}

function loadChat(id) {
  if (activeStream) { activeStream.abort(); activeStream = null; }
  const conv = getConversation(id);
  if (!conv) return;
  currentConv = conv;
  setCurrentConversationId(id);
  $("cb").style.display = conv.messages.length ? "block" : "none";
  renderView();
}

function clearChat() {
  if (activeStream) { activeStream.abort(); activeStream = null; }
  currentConv = newConversation();
  $("cb").style.display = "none";
  renderView();
  renderConversationList(loadChat);
}

function renderView() {
  const el = $("msgs");
  if (!currentConv.messages || !currentConv.messages.length) {
    el.innerHTML = renderWelcome(ADVISOR_KEYS, SUGGESTED);
  } else {
    renderMessages(currentConv.messages, el);
  }
}

// --- Advisor chip selection ---
function renderAdvisorChips() {
  const selected = getSelectedAdvisors();
  const container = $("advisor-chips");
  let h = "";
  ADVISOR_KEYS.forEach(k => {
    const a = ADVISORS[k];
    const on = selected.includes(k);
    h += `<button class="chip${on ? " chip-on" : ""}" data-key="${k}" style="--chip-c:${a.c};border-color:${on ? a.c + "60" : "#252525"};background:${on ? a.c + "14" : "#171717"};color:${on ? "#e8e8e8" : "#555"}">
      <span class="chip-icon">${a.i}</span>${a.s}
    </button>`;
  });
  container.innerHTML = h;

  container.querySelectorAll(".chip").forEach(btn => {
    btn.addEventListener("click", () => toggleAdvisor(btn.dataset.key));
  });

  updateInputBadge(selected);
  updateAllToggle(selected);
}

function toggleAdvisor(key) {
  let selected = getSelectedAdvisors();
  if (selected.includes(key)) {
    selected = selected.filter(k => k !== key);
    if (selected.length === 0) selected = [key]; // keep at least one
  } else {
    selected.push(key);
  }
  setSelectedAdvisors(selected);
  renderAdvisorChips();
}

function toggleAll() {
  const selected = getSelectedAdvisors();
  if (selected.length === ADVISOR_KEYS.length) {
    setSelectedAdvisors(["analyst", "buffett", "munger"]);
  } else {
    setSelectedAdvisors([...ADVISOR_KEYS]);
  }
  renderAdvisorChips();
}

function updateAllToggle(selected) {
  const btn = $("all-toggle");
  const allSelected = selected.length === ADVISOR_KEYS.length;
  btn.style.borderColor = allSelected ? "#C4A44A60" : "#252525";
  btn.style.background = allSelected ? "#C4A44A14" : "#171717";
  btn.style.color = allSelected ? "#E8E0C8" : "#555";
}

function updateInputBadge(selected) {
  const b = $("mbg");
  if (selected.length <= 3) {
    b.innerHTML = selected.map(k => `<span>${ADVISORS[k].i}</span>`).join("");
  } else {
    b.innerHTML = `<span>${ADVISORS[selected[0]].i}</span><span style="font-size:10px;color:#666">+${selected.length - 1}</span>`;
  }
  b.style.background = selected.length === 1 ? ADVISORS[selected[0]].c + "15" : "#C4A44A15";

  const placeholder = selected.length === 1 ? `Ask ${ADVISORS[selected[0]].n}...` : `Ask ${selected.length} advisors...`;
  $("inp").placeholder = placeholder;
}

function updateSendButton() {
  const v = $("inp").value.trim();
  const b = $("snd");
  const selected = getSelectedAdvisors();
  const mc = selected.length === 1 ? ADVISORS[selected[0]].g : "linear-gradient(135deg,#8B7A2A,#C4A44A)";
  b.disabled = !v || busy;
  b.style.background = v && !busy ? mc : "#222";
  b.style.color = v && !busy ? "#FFF" : "#555";
}

// --- Update a single advisor card's text incrementally ---
function updateCardText(advisorKey, text) {
  const el = document.querySelector(`[data-stream-advisor="${advisorKey}"] .ct`);
  if (el) el.innerHTML = formatText(text);
}

function markCardDone(advisorKey) {
  const card = document.querySelector(`[data-stream-advisor="${advisorKey}"]`);
  if (!card) return;
  // Remove loading dots if still present
  const dots = card.querySelector(".dots");
  if (dots) dots.remove();
}

function markCardError(advisorKey, errorText) {
  const card = document.querySelector(`[data-stream-advisor="${advisorKey}"]`);
  if (!card) return;
  const dots = card.querySelector(".dots");
  if (dots) dots.remove();
  const ct = card.querySelector(".ct");
  if (ct) {
    ct.classList.add("err");
    ct.innerHTML = formatText(errorText);
  }
  const cn = card.querySelector(".cn");
  if (cn) cn.style.color = "#C87070";
}

// --- Send message with streaming ---
async function go(prefill) {
  const inp = $("inp");
  const txt = prefill || inp.value.trim();
  if (!txt || busy) return;

  const selected = getSelectedAdvisors();
  busy = true;
  inp.value = "";
  updateSendButton();

  const tk = detectTicker(txt);
  currentConv.messages.push({ t: "u", x: txt, tgts: selected });

  // Create response entry with loading state
  const responseEntry = { t: "r", d: {} };
  selected.forEach(k => { responseEntry.d[k] = { l: true, x: "", e: false }; });
  if (tk) responseEntry.tk = tk;
  currentConv.messages.push(responseEntry);
  renderView();
  $("cb").style.display = "block";

  // Build conversation history per advisor
  const convHistory = {};
  for (const k of selected) {
    const history = [];
    for (const msg of currentConv.messages.slice(0, -2)) {
      if (msg.t === "u") {
        history.push({ role: "user", content: msg.x });
      }
      if (msg.t === "r" && msg.d && msg.d[k] && !msg.d[k].e && !msg.d[k].l) {
        history.push({ role: "assistant", content: msg.d[k].x });
      }
    }
    convHistory[k] = history.slice(-20);
  }

  // Accumulated text per advisor for streaming
  const accumulated = {};
  selected.forEach(k => { accumulated[k] = ""; });

  // Render the initial streaming cards (with loading dots and empty text area)
  renderStreamingCards(responseEntry, selected);

  activeStream = streamAdvisors({
    question: txt,
    advisors: selected,
    ticker: tk,
    conversationHistory: convHistory,

    onStart({ advisor, name, icon }) {
      // Replace loading dots with empty text container
      responseEntry.d[advisor] = { l: false, x: "", e: false };
      const card = document.querySelector(`[data-stream-advisor="${advisor}"]`);
      if (card) {
        const dots = card.querySelector(".dots");
        if (dots) dots.remove();
        // Ensure text container exists
        let ct = card.querySelector(".ct");
        if (!ct) {
          ct = document.createElement("div");
          ct.className = "ct";
          card.appendChild(ct);
        }
      }
    },

    onDelta({ advisor, text }) {
      accumulated[advisor] += text;
      responseEntry.d[advisor].x = accumulated[advisor];
      updateCardText(advisor, accumulated[advisor]);
      // Auto-scroll
      const msgs = $("msgs");
      msgs.scrollTop = msgs.scrollHeight;
    },

    onDone({ advisor }) {
      responseEntry.d[advisor].l = false;
      markCardDone(advisor);
    },

    onError({ advisor, text }) {
      if (advisor) {
        responseEntry.d[advisor] = { l: false, x: text || "Error", e: true };
        markCardError(advisor, text || "Error");
      } else {
        // Global error - mark all loading advisors as failed
        selected.forEach(k => {
          if (responseEntry.d[k].l) {
            responseEntry.d[k] = { l: false, x: text || "Connection error", e: true };
          }
        });
        renderView();
      }
    },

    onFinancial({ context }) {
      responseEntry.fc = context;
      if (tk) {
        const fb = document.querySelector(".fb-stream");
        if (fb) {
          fb.textContent = `\u{1F52C} Financial data pulled for ${tk}`;
          fb.style.display = "block";
        }
      }
    },

    onComplete() {
      activeStream = null;
      currentConv.advisorIcons = selected.map(k => ADVISORS[k].i).join("");
      saveConversation(currentConv);
      setCurrentConversationId(currentConv.id);
      renderConversationList(loadChat);
      busy = false;
      updateSendButton();
      inp.focus();
    },
  });
}

function renderStreamingCards(entry, selected) {
  const el = $("msgs");
  // Re-render all messages up to the last response, then render streaming cards
  let h = "";
  for (const e of currentConv.messages.slice(0, -1)) {
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
      if (e.fc) h += `<div class="fb">\u{1F52C} Financial data pulled${e.tk ? " for " + e.tk : ""}</div>`;
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

  // Current user message
  const userMsg = currentConv.messages[currentConv.messages.length - 2];
  if (userMsg && userMsg.t === "u") {
    h += `<div class="mu"><div style="max-width:82%">`;
    if (userMsg.tgts && userMsg.tgts.length > 1) h += `<div class="mt">${userMsg.tgts.map(t => {
      const a = ADVISORS[t];
      return a ? `<span class="tg" style="background:${a.c}20;color:${a.c}">${a.i} ${a.s}</span>` : "";
    }).join("")}</div>`;
    h += `<div class="mb">${esc(userMsg.x)}</div></div></div>`;
  }

  // Streaming response cards
  h += `<div style="margin-bottom:18px;max-width:92%">`;
  h += `<div class="fb fb-stream" style="display:none">\u{1F52C} Loading financial data...</div>`;
  for (const k of selected) {
    const a = ADVISORS[k];
    h += `<div class="cd" data-stream-advisor="${k}" style="border-color:${a.c}30">`;
    h += `<div class="ch"><div class="ci" style="background:${a.g}">${a.i}</div><span class="cn" style="color:${a.c}">${a.n}</span></div>`;
    h += `<div class="dots"><div class="dot" style="background:${a.c}"></div><div class="dot" style="background:${a.c};animation-delay:.2s"></div><div class="dot" style="background:${a.c};animation-delay:.4s"></div></div>`;
    h += `<div class="ct"></div>`;
    h += `</div>`;
  }
  h += `</div>`;

  el.innerHTML = h;
  setTimeout(() => { el.scrollTop = el.scrollHeight; }, 50);
}

init();
