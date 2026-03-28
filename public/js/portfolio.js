import { getPortfolio, savePortfolio, updatePrices, setAlert } from './storage.js';
import { analyzePortfolio, fetchQuotes } from './api.js';
import { ADVISORS, ADVISOR_KEYS } from './advisors.js';
import { formatText, esc, timeAgo, fmtMoney, fmtPct, pnlPct as calcPnlPct } from './ui.js';
import { checkAlerts, requestNotificationPermission } from './alerts.js';

let analysisResult = null;
let analyzing = false;
let refreshTimer = null;
let lastRefresh = 0;
let isPortfolioActive = false;
const REFRESH_INTERVAL = 15 * 60 * 1000;

export function initPortfolio() {
  document.getElementById("add-position-btn").addEventListener("click", showAddForm);
  document.getElementById("add-form-cancel").addEventListener("click", hideAddForm);
  document.getElementById("add-form-save").addEventListener("click", savePosition);
  document.getElementById("alert-modal-save").addEventListener("click", saveAlerts);
  document.getElementById("alert-modal-cancel").addEventListener("click", hideAlertModal);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    } else if (isPortfolioActive && getPortfolio().positions.length > 0) {
      startRefreshTimer();
      if (Date.now() - lastRefresh > 5 * 60 * 1000) refreshPrices();
    }
  });
}

function startRefreshTimer() {
  if (refreshTimer) return;
  refreshTimer = setInterval(refreshPrices, REFRESH_INTERVAL);
}

export async function refreshPrices() {
  const portfolio = getPortfolio();
  if (!portfolio.positions.length) return;

  const tickers = portfolio.positions.map(p => p.ticker);
  try {
    const data = await fetchQuotes(tickers);
    if (data.quotes && Object.keys(data.quotes).length > 0) {
      const updated = updatePrices(data.quotes);
      lastRefresh = Date.now();
      checkAlerts(updated.positions);
      renderPortfolio();
    }
  } catch { /* will retry on next interval */ }
}

export async function onPortfolioView() {
  isPortfolioActive = true;
  const portfolio = getPortfolio();
  if (portfolio.positions.length > 0) {
    startRefreshTimer();
    renderPortfolio();
    await refreshPrices();
  } else {
    renderPortfolio();
  }
}

export function onPortfolioLeave() {
  isPortfolioActive = false;
}

function showAddForm() {
  document.getElementById("add-position-form").style.display = "block";
  document.getElementById("pos-ticker").focus();
}

function hideAddForm() {
  document.getElementById("add-position-form").style.display = "none";
  document.getElementById("pos-ticker").value = "";
  document.getElementById("pos-shares").value = "";
  document.getElementById("pos-cost").value = "";
  document.getElementById("pos-date").value = "";
}

function savePosition() {
  const ticker = document.getElementById("pos-ticker").value.trim().toUpperCase();
  const shares = parseFloat(document.getElementById("pos-shares").value);
  const avgCost = parseFloat(document.getElementById("pos-cost").value);
  const dateStr = document.getElementById("pos-date").value;
  const date = dateStr ? new Date(dateStr).getTime() : Date.now();
  if (!ticker || isNaN(shares) || isNaN(avgCost) || shares <= 0 || avgCost <= 0) return;

  const portfolio = getPortfolio();
  const existing = portfolio.positions.findIndex(p => p.ticker === ticker);
  if (existing >= 0) {
    const p = portfolio.positions[existing];
    const totalShares = p.shares + shares;
    p.avgCost = ((p.shares * p.avgCost) + (shares * avgCost)) / totalShares;
    p.shares = totalShares;
    if (!p.transactions) p.transactions = [];
    p.transactions.push({ shares, price: avgCost, date });
  } else {
    portfolio.positions.push({
      ticker, shares, avgCost, addedAt: Date.now(),
      currentPrice: null, lastPriceUpdate: null, priceChange: null, priceChangePercent: null,
      transactions: [{ shares, price: avgCost, date }],
      alerts: { stopLoss: null, takeProfit: null },
    });
  }
  savePortfolio(portfolio);
  hideAddForm();
  renderPortfolio();
  refreshPrices();
  requestNotificationPermission();
}

export function deletePosition(ticker) {
  const portfolio = getPortfolio();
  portfolio.positions = portfolio.positions.filter(p => p.ticker !== ticker);
  savePortfolio(portfolio);
  renderPortfolio();
}

function showAlertModal(ticker) {
  const portfolio = getPortfolio();
  const pos = portfolio.positions.find(p => p.ticker === ticker);
  if (!pos) return;
  const alerts = pos.alerts || { stopLoss: null, takeProfit: null };

  const modal = document.getElementById("alert-modal");
  document.getElementById("alert-modal-ticker").textContent = ticker;
  document.getElementById("alert-stop-loss").value = alerts.stopLoss != null ? alerts.stopLoss : "";
  document.getElementById("alert-take-profit").value = alerts.takeProfit != null ? alerts.takeProfit : "";
  modal.dataset.ticker = ticker;
  modal.style.display = "flex";
}

function hideAlertModal() {
  document.getElementById("alert-modal").style.display = "none";
}

function saveAlerts() {
  const modal = document.getElementById("alert-modal");
  const ticker = modal.dataset.ticker;
  const sl = document.getElementById("alert-stop-loss").value;
  const tp = document.getElementById("alert-take-profit").value;
  setAlert(ticker, "stopLoss", sl ? parseFloat(sl) : null);
  setAlert(ticker, "takeProfit", tp ? parseFloat(tp) : null);
  hideAlertModal();
  renderPortfolio();
}

async function runAnalysis() {
  const portfolio = getPortfolio();
  if (!portfolio.positions.length) return;

  analyzing = true;
  analysisResult = null;
  renderPortfolio();

  const advisor = document.getElementById("analysis-advisor").value || "analyst";
  const positions = portfolio.positions.map(p => ({
    ticker: p.ticker,
    shares: p.shares,
    avgCost: p.avgCost,
    currentPrice: p.currentPrice || p.avgCost,
  }));

  try {
    const data = await analyzePortfolio(positions, advisor);
    analysisResult = data;
  } catch (e) {
    analysisResult = { ok: false, text: "Connection error: " + e.message };
  }
  analyzing = false;
  renderPortfolio();
}

export function renderPortfolio() {
  const el = document.getElementById("portfolio-content");
  const portfolio = getPortfolio();
  const positions = portfolio.positions;

  let h = "";

  if (!positions.length) {
    h += `<div style="text-align:center;padding:40px 20px">
      <div style="font-size:36px;margin-bottom:12px">\u{1F4CA}</div>
      <div style="font-size:16px;color:#ddd;margin-bottom:6px">No positions yet</div>
      <div style="font-size:12px;color:#666;margin-bottom:20px">Add your first position to start tracking</div>
    </div>`;
  } else {
    const totalCost = positions.reduce((s, p) => s + (p.shares * p.avgCost), 0);
    const totalValue = positions.reduce((s, p) => s + (p.shares * (p.currentPrice || p.avgCost)), 0);
    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const hasLive = positions.some(p => p.currentPrice);

    h += `<div class="port-summary">
      <div class="port-total-label">${hasLive ? "Portfolio Value" : "Total Cost Basis"}</div>
      <div class="port-total-value">${fmtMoney(hasLive ? totalValue : totalCost)}</div>`;
    if (hasLive) {
      const cls = totalPnl >= 0 ? "pnl-up" : "pnl-down";
      h += `<div class="port-pnl ${cls}">${totalPnl >= 0 ? "+" : "-"}${fmtMoney(totalPnl)} (${fmtPct(totalPnlPct)})</div>`;
    }
    h += `<div class="port-count">${positions.length} position${positions.length > 1 ? "s" : ""}`;
    if (lastRefresh) h += ` \u{00B7} Updated ${timeAgo(lastRefresh)}`;
    h += `</div>`;
    h += `<button class="port-refresh-btn" id="refresh-prices-btn">\u{21BB} Refresh Prices</button>`;
    h += `</div>`;

    h += `<div class="port-positions">`;
    for (const p of positions) {
      const livePrice = p.currentPrice || null;
      const value = p.shares * (livePrice || p.avgCost);
      const weight = (value / totalValue * 100).toFixed(1);
      const pnl = livePrice ? (livePrice - p.avgCost) * p.shares : null;
      const pnlPctVal = livePrice ? calcPnlPct(livePrice, p.avgCost) : null;
      const hasAlerts = p.alerts && (p.alerts.stopLoss != null || p.alerts.takeProfit != null);

      h += `<div class="port-card">
        <div class="port-card-top">
          <div class="port-ticker">${esc(p.ticker)}</div>`;
      if (livePrice) {
        h += `<div class="port-live-price">
          <span class="port-price-val">$${livePrice.toFixed(2)}</span>`;
        if (p.priceChangePercent != null) {
          const dc = p.priceChangePercent >= 0 ? "pnl-up" : "pnl-down";
          h += `<span class="port-day-change ${dc}">${p.priceChangePercent >= 0 ? "\u25B2" : "\u25BC"} ${Math.abs(p.priceChangePercent).toFixed(2)}%</span>`;
        }
        h += `</div>`;
      }
      h += `<div class="port-weight">${weight}%</div>`;
      if (hasAlerts) h += `<span class="port-alert-badge">\u{1F514}</span>`;
      h += `<button class="port-alert-btn" data-alert-ticker="${esc(p.ticker)}" title="Set alerts">\u{23F0}</button>`;
      h += `<button class="port-card-del" data-del-ticker="${esc(p.ticker)}">\u{2715}</button>`;
      h += `</div>`;

      h += `<div class="port-card-details">
        <div><span class="port-label">Shares</span><span class="port-val">${p.shares}</span></div>
        <div><span class="port-label">Avg Cost</span><span class="port-val">$${p.avgCost.toFixed(2)}</span></div>
        <div><span class="port-label">Value</span><span class="port-val">${fmtMoney(value)}</span></div>`;
      if (pnl != null) {
        const cls = pnl >= 0 ? "pnl-up" : "pnl-down";
        h += `<div><span class="port-label">P&L</span><span class="port-val ${cls}">${pnl >= 0 ? "+" : "-"}${fmtMoney(pnl)} (${fmtPct(pnlPctVal)})</span></div>`;
      }
      h += `</div>`;

      if (hasAlerts) {
        h += `<div class="port-alerts-row">`;
        if (p.alerts.stopLoss != null) h += `<span class="port-alert-tag alert-sl">\u{1F6D1} Stop: -${p.alerts.stopLoss}%</span>`;
        if (p.alerts.takeProfit != null) h += `<span class="port-alert-tag alert-tp">\u{1F3AF} Target: +${p.alerts.takeProfit}%</span>`;
        h += `</div>`;
      }

      if (p.transactions && p.transactions.length > 0) {
        h += `<details class="port-tx-details">
          <summary class="port-tx-summary">${p.transactions.length} transaction${p.transactions.length > 1 ? "s" : ""}</summary>
          <div class="port-tx-list">`;
        for (const tx of [...p.transactions].sort((a, b) => b.date - a.date)) {
          const d = new Date(tx.date);
          h += `<div class="port-tx-item">
            <span class="port-tx-date">${d.toLocaleDateString()}</span>
            <span class="port-tx-info">${tx.shares} shares @ $${tx.price.toFixed(2)}</span>
            <span class="port-tx-total">${fmtMoney(tx.shares * tx.price)}</span>
          </div>`;
        }
        h += `</div></details>`;
      }

      h += `</div>`;
    }
    h += `</div>`;

    h += `<div class="port-analysis-section">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <select id="analysis-advisor" class="port-advisor-select">
          ${ADVISOR_KEYS.map(k => `<option value="${k}">${ADVISORS[k].i} ${ADVISORS[k].n}</option>`).join("")}
        </select>
        <button id="analyze-btn" class="port-analyze-btn" ${analyzing ? "disabled" : ""}>
          ${analyzing ? "Analyzing..." : "\u{1F9E0} Analyze"}
        </button>
      </div>`;

    if (analyzing) {
      h += `<div class="cd" style="border-color:#C4A44A30"><div class="dots"><div class="dot" style="background:#C4A44A"></div><div class="dot" style="background:#C4A44A;animation-delay:.2s"></div><div class="dot" style="background:#C4A44A;animation-delay:.4s"></div></div></div>`;
    } else if (analysisResult) {
      const adv = analysisResult.advisor || {};
      h += `<div class="cd" style="border-color:${analysisResult.ok ? "#4A7C5C30" : "#7A3A3A"}">
        <div class="ch"><div class="ci" style="background:linear-gradient(135deg,#2D4A3E,#4A7C5C)">${adv.icon || "\u{1F9E0}"}</div>
        <span class="cn" style="color:${analysisResult.ok ? "#4A7C5C" : "#C87070"}">${adv.name || "Analysis"}</span>
        ${!analysisResult.ok ? '<span class="ce">ERROR</span>' : ""}</div>
        <div class="ct${!analysisResult.ok ? " err" : ""}">${formatText(analysisResult.text)}</div>
      </div>`;
    }
    h += `</div>`;
  }

  el.innerHTML = h;

  const analyzeBtn = document.getElementById("analyze-btn");
  if (analyzeBtn) analyzeBtn.addEventListener("click", runAnalysis);
  const refreshBtn = document.getElementById("refresh-prices-btn");
  if (refreshBtn) refreshBtn.addEventListener("click", refreshPrices);

  el.querySelectorAll(".port-alert-btn").forEach(btn => {
    btn.addEventListener("click", () => showAlertModal(btn.dataset.alertTicker));
  });
  el.querySelectorAll(".port-card-del").forEach(btn => {
    btn.addEventListener("click", () => deletePosition(btn.dataset.delTicker));
  });
}
