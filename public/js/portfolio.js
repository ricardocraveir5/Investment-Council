import { getPortfolio, savePortfolio } from './storage.js';
import { analyzePortfolio } from './api.js';
import { ADVISORS, ADVISOR_KEYS } from './advisors.js';
import { formatText, esc } from './ui.js';

let analysisResult = null;
let analyzing = false;

export function initPortfolio() {
  document.getElementById("add-position-btn").addEventListener("click", showAddForm);
  document.getElementById("add-form-cancel").addEventListener("click", hideAddForm);
  document.getElementById("add-form-save").addEventListener("click", savePosition);
  document.getElementById("analyze-btn").addEventListener("click", runAnalysis);
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
}

function savePosition() {
  const ticker = document.getElementById("pos-ticker").value.trim().toUpperCase();
  const shares = parseFloat(document.getElementById("pos-shares").value);
  const avgCost = parseFloat(document.getElementById("pos-cost").value);
  if (!ticker || isNaN(shares) || isNaN(avgCost) || shares <= 0 || avgCost <= 0) return;

  const portfolio = getPortfolio();
  const existing = portfolio.positions.findIndex(p => p.ticker === ticker);
  if (existing >= 0) {
    const p = portfolio.positions[existing];
    const totalShares = p.shares + shares;
    p.avgCost = ((p.shares * p.avgCost) + (shares * avgCost)) / totalShares;
    p.shares = totalShares;
  } else {
    portfolio.positions.push({ ticker, shares, avgCost, addedAt: Date.now() });
  }
  savePortfolio(portfolio);
  hideAddForm();
  renderPortfolio();
}

export function deletePosition(ticker) {
  const portfolio = getPortfolio();
  portfolio.positions = portfolio.positions.filter(p => p.ticker !== ticker);
  savePortfolio(portfolio);
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
    currentPrice: p.avgCost,
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
      <div style="font-size:36px;margin-bottom:12px">📊</div>
      <div style="font-size:16px;color:#ddd;margin-bottom:6px">No positions yet</div>
      <div style="font-size:12px;color:#666;margin-bottom:20px">Add your first position to start tracking</div>
    </div>`;
  } else {
    const totalValue = positions.reduce((sum, p) => sum + (p.shares * p.avgCost), 0);
    h += `<div class="port-summary">
      <div class="port-total-label">Total Cost Basis</div>
      <div class="port-total-value">$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      <div class="port-count">${positions.length} position${positions.length > 1 ? "s" : ""}</div>
    </div>`;

    h += `<div class="port-positions">`;
    for (const p of positions) {
      const value = p.shares * p.avgCost;
      const weight = (value / totalValue * 100).toFixed(1);
      h += `<div class="port-card">
        <div class="port-card-top">
          <div class="port-ticker">${esc(p.ticker)}</div>
          <div class="port-weight">${weight}%</div>
          <button class="port-card-del" onclick="window.__deletePosition('${esc(p.ticker)}')">✕</button>
        </div>
        <div class="port-card-details">
          <div><span class="port-label">Shares</span><span class="port-val">${p.shares}</span></div>
          <div><span class="port-label">Avg Cost</span><span class="port-val">$${p.avgCost.toFixed(2)}</span></div>
          <div><span class="port-label">Value</span><span class="port-val">$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
        </div>
      </div>`;
    }
    h += `</div>`;

    h += `<div class="port-analysis-section">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <select id="analysis-advisor" class="port-advisor-select">
          ${ADVISOR_KEYS.map(k => `<option value="${k}">${ADVISORS[k].i} ${ADVISORS[k].n}</option>`).join("")}
        </select>
        <button id="analyze-btn" class="port-analyze-btn" ${analyzing ? "disabled" : ""}>
          ${analyzing ? "Analyzing..." : "🧠 Analyze"}
        </button>
      </div>`;

    if (analyzing) {
      h += `<div class="cd" style="border-color:#C4A44A30"><div class="dots"><div class="dot" style="background:#C4A44A"></div><div class="dot" style="background:#C4A44A;animation-delay:.2s"></div><div class="dot" style="background:#C4A44A;animation-delay:.4s"></div></div></div>`;
    } else if (analysisResult) {
      const adv = analysisResult.advisor || {};
      h += `<div class="cd" style="border-color:${analysisResult.ok ? "#4A7C5C30" : "#7A3A3A"}">
        <div class="ch"><div class="ci" style="background:linear-gradient(135deg,#2D4A3E,#4A7C5C)">${adv.icon || "🧠"}</div>
        <span class="cn" style="color:${analysisResult.ok ? "#4A7C5C" : "#C87070"}">${adv.name || "Analysis"}</span>
        ${!analysisResult.ok ? '<span class="ce">ERROR</span>' : ""}</div>
        <div class="ct${!analysisResult.ok ? " err" : ""}">${formatText(analysisResult.text)}</div>
      </div>`;
    }
    h += `</div>`;
  }

  el.innerHTML = h;

  // Re-bind event listeners after render
  const analyzeBtn = document.getElementById("analyze-btn");
  if (analyzeBtn) analyzeBtn.addEventListener("click", runAnalysis);
  const addBtn = document.getElementById("add-position-btn");
  if (addBtn) addBtn.removeEventListener("click", showAddForm);
}

// Expose delete for onclick
window.__deletePosition = deletePosition;
