const PREFIX = "council_";
const INDEX_KEY = PREFIX + "conv_index";
const CURRENT_KEY = PREFIX + "current_conv";
const SELECTED_KEY = PREFIX + "selected_advisors";
const PORTFOLIO_KEY = PREFIX + "portfolio";
const ALERTS_KEY = PREFIX + "dismissed_alerts";
const MAX_CONVERSATIONS = 50;

function genId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function getIndex() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || []; }
  catch { return []; }
}

function saveIndex(index) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export function listConversations() {
  return getIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getConversation(id) {
  try { return JSON.parse(localStorage.getItem(PREFIX + "conv_" + id)); }
  catch { return null; }
}

export function saveConversation(conv) {
  if (!conv.id) conv.id = genId();
  if (!conv.createdAt) conv.createdAt = Date.now();
  conv.updatedAt = Date.now();
  if (!conv.title && conv.messages.length > 0) {
    const firstUser = conv.messages.find(m => m.t === "u" || m.role === "user");
    const text = firstUser ? (firstUser.x || firstUser.content) : null;
    conv.title = text ? text.slice(0, 50) : "New chat";
  }
  localStorage.setItem(PREFIX + "conv_" + conv.id, JSON.stringify(conv));

  const index = getIndex();
  const existing = index.findIndex(i => i.id === conv.id);
  const entry = { id: conv.id, title: conv.title, updatedAt: conv.updatedAt, advisorIcons: conv.advisorIcons || "" };
  if (existing >= 0) index[existing] = entry;
  else index.push(entry);

  while (index.length > MAX_CONVERSATIONS) {
    const oldest = index.sort((a, b) => a.updatedAt - b.updatedAt)[0];
    localStorage.removeItem(PREFIX + "conv_" + oldest.id);
    index.splice(index.indexOf(oldest), 1);
  }
  saveIndex(index);
  return conv;
}

export function deleteConversation(id) {
  localStorage.removeItem(PREFIX + "conv_" + id);
  const index = getIndex().filter(i => i.id !== id);
  saveIndex(index);
  const current = getCurrentConversationId();
  if (current === id) setCurrentConversationId(null);
}

export function getCurrentConversationId() {
  return localStorage.getItem(CURRENT_KEY);
}

export function setCurrentConversationId(id) {
  if (id) localStorage.setItem(CURRENT_KEY, id);
  else localStorage.removeItem(CURRENT_KEY);
}

export function newConversation() {
  const conv = { id: genId(), title: "", messages: [], createdAt: Date.now(), updatedAt: Date.now(), advisorIcons: "" };
  setCurrentConversationId(conv.id);
  return conv;
}

export function getSelectedAdvisors() {
  try {
    const saved = JSON.parse(localStorage.getItem(SELECTED_KEY));
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch {}
  return ["analyst", "buffett", "munger"];
}

export function setSelectedAdvisors(keys) {
  localStorage.setItem(SELECTED_KEY, JSON.stringify(keys));
}

// --- Portfolio ---

export function getPortfolio() {
  try { return JSON.parse(localStorage.getItem(PORTFOLIO_KEY)) || { positions: [], watchlist: [] }; }
  catch { return { positions: [], watchlist: [] }; }
}

export function savePortfolio(portfolio) {
  localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(portfolio));
}

export function addTransaction(ticker, shares, price, date) {
  const portfolio = getPortfolio();
  const pos = portfolio.positions.find(p => p.ticker === ticker);
  if (!pos) return;
  if (!pos.transactions) pos.transactions = [];
  pos.transactions.push({ shares, price, date: date || Date.now() });
  savePortfolio(portfolio);
}

export function updatePrices(priceMap) {
  const portfolio = getPortfolio();
  const now = Date.now();
  for (const p of portfolio.positions) {
    if (priceMap[p.ticker]) {
      p.currentPrice = priceMap[p.ticker].price;
      p.priceChange = priceMap[p.ticker].change;
      p.priceChangePercent = priceMap[p.ticker].changePercent;
      p.lastPriceUpdate = now;
    }
  }
  savePortfolio(portfolio);
  return portfolio;
}

// --- Alerts ---

export function getAlerts(ticker) {
  const portfolio = getPortfolio();
  const pos = portfolio.positions.find(p => p.ticker === ticker);
  return pos?.alerts || { stopLoss: null, takeProfit: null };
}

export function setAlert(ticker, type, value) {
  const portfolio = getPortfolio();
  const pos = portfolio.positions.find(p => p.ticker === ticker);
  if (!pos) return;
  if (!pos.alerts) pos.alerts = { stopLoss: null, takeProfit: null };
  pos.alerts[type] = value;
  savePortfolio(portfolio);
}

export function getDismissedAlerts() {
  try { return JSON.parse(localStorage.getItem(ALERTS_KEY)) || {}; }
  catch { return {}; }
}

export function dismissAlert(key) {
  const dismissed = getDismissedAlerts();
  dismissed[key] = Date.now();
  localStorage.setItem(ALERTS_KEY, JSON.stringify(dismissed));
}
