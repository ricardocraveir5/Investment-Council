import { TICKERS } from './advisors.js';

export function detectTicker(text) {
  const m1 = text.match(/\$([A-Z]{1,5})\b/);
  if (m1) return m1[1];
  const re = new RegExp("\\b(" + TICKERS.join("|") + ")\\b", "i");
  const m2 = text.match(re);
  return m2 ? m2[1].toUpperCase() : "";
}

export async function askAdvisors({ question, advisors, ticker, conversationHistory }) {
  const ep = ticker ? "/api/research" : "/api/ask";
  const body = { question, advisors, conversationHistory };
  if (ticker) body.ticker = ticker;
  const r = await fetch(ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}

export async function fetchPrices(tickers) {
  const r = await fetch("/api/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tickers }) });
  return r.json();
}

export async function analyzePortfolio(positions, advisor) {
  const r = await fetch("/api/analyze-portfolio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positions, advisor }) });
  return r.json();
}
