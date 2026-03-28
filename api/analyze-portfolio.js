const Anthropic = require("@anthropic-ai/sdk");
const { ADVISORS } = require("./lib/advisors");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { positions = [], advisor = "analyst" } = req.body || {};
  if (!positions.length) return res.status(400).json({ error: "No positions" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  if (!ADVISORS[advisor]) return res.status(400).json({ error: "Invalid advisor" });

  const totalValue = positions.reduce((sum, p) => sum + (p.shares * p.currentPrice), 0);
  let portfolioSummary = `=== Portfolio Analysis Request ===\n\nTotal Value: $${totalValue.toLocaleString()}\n\nPositions:\n`;
  for (const p of positions) {
    const value = p.shares * p.currentPrice;
    const weight = (value / totalValue * 100).toFixed(1);
    const pnl = ((p.currentPrice - p.avgCost) / p.avgCost * 100).toFixed(1);
    portfolioSummary += `  ${p.ticker}: ${p.shares} shares @ $${p.avgCost} avg (current: $${p.currentPrice}) | Weight: ${weight}% | P&L: ${pnl}%\n`;
  }
  portfolioSummary += `\nPlease analyze this portfolio for: concentration risk, sector diversification, correlation concerns, and provide specific rebalancing suggestions.`;

  const anthropic = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    res.status(500).json({ ok: false, text: `Error: ${err.message}` });
  }
};
