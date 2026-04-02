import { createClient } from "./lib/anthropic.js";
import { ADVISORS } from "./lib/advisors.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { positions = [], advisor = "analyst" } = req.body || {};
  if (!positions.length) return res.status(400).json({ error: "No positions" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  if (!ADVISORS[advisor]) return res.status(400).json({ error: "Invalid advisor" });

  const totalValue = positions.reduce((sum, p) => sum + (p.shares * (p.currentPrice || p.avgCost || 0)), 0);
  if (totalValue === 0) return res.status(400).json({ error: "Portfolio has no value" });
  let portfolioSummary = `=== Portfolio Analysis Request ===\n\nTotal Value: $${totalValue.toLocaleString()}\n\nPositions:\n`;
  for (const p of positions) {
    const price = p.currentPrice || p.avgCost || 0;
    const value = p.shares * price;
    const weight = (value / totalValue * 100).toFixed(1);
    const pnl = p.avgCost ? ((price - p.avgCost) / p.avgCost * 100).toFixed(1) : "0.0";
    portfolioSummary += `  ${p.ticker}: ${p.shares} shares @ $${p.avgCost} avg (current: $${price}) | Weight: ${weight}% | P&L: ${pnl}%\n`;
  }
  portfolioSummary += `\nPlease analyze this portfolio for: concentration risk, sector diversification, correlation concerns, and provide specific rebalancing suggestions.`;

  const anthropic = createClient();

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: ADVISORS[advisor].system,
      messages: [{ role: "user", content: portfolioSummary }],
    });
    const text = response.content.filter(b => b.type === "text").map(b => b.text).join("\n");
    res.status(200).json({ ok: true, text, advisor: { name: ADVISORS[advisor].name, icon: ADVISORS[advisor].icon } });
  } catch (err) {
    res.status(500).json({ ok: false, text: "Unable to generate response" });
  }
}
