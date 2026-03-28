import { ADVISORS, ADVISOR_KEYS, SUGGESTED } from './advisors.js';
import { getSelectedAdvisors, setSelectedAdvisors, getConversation, saveConversation, newConversation, getCurrentConversationId, setCurrentConversationId } from './storage.js';
import { detectTicker, askAdvisors } from './api.js';
import { renderMessages, renderWelcome, esc } from './ui.js';
import { initSidebar, renderConversationList } from './sidebar.js';
import { initPortfolio, renderPortfolio } from './portfolio.js';

let currentConv = null;
let busy = false;
let currentView = "council";

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
  currentConv = newConversation();
  $("cb").style.display = "none";
  renderView();
}

function loadChat(id) {
  const conv = getConversation(id);
  if (!conv) return;
  currentConv = conv;
  setCurrentConversationId(id);
  $("cb").style.display = conv.messages.length ? "block" : "none";
  renderView();
}

function clearChat() {
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

// --- Send message ---
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

  const loadingEntry = { t: "r", d: {} };
  selected.forEach(k => { loadingEntry.d[k] = { l: true, x: "", e: false }; });
  if (tk) loadingEntry.tk = tk;
  currentConv.messages.push(loadingEntry);
  renderView();
  $("cb").style.display = "block";

  // Build conversation history per advisor (last 10 exchanges)
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

  try {
    const data = await askAdvisors({ question: txt, advisors: selected, ticker: tk, conversationHistory: convHistory });
    if (data.error) {
      selected.forEach(k => { loadingEntry.d[k] = { l: false, x: data.error, e: true }; });
    } else {
      for (const k of selected) {
        const v = data.results[k];
        loadingEntry.d[k] = v ? { l: false, x: v.text, e: !v.ok } : { l: false, x: "No response", e: true };
      }
      if (data.financialContext) loadingEntry.fc = data.financialContext;
    }
  } catch (e) {
    selected.forEach(k => { loadingEntry.d[k] = { l: false, x: "Connection error: " + e.message, e: true }; });
  }

  currentConv.advisorIcons = selected.map(k => ADVISORS[k].i).join("");
  saveConversation(currentConv);
  setCurrentConversationId(currentConv.id);
  renderConversationList(loadChat);

  busy = false;
  updateSendButton();
  renderView();
  inp.focus();
}

init();
