const BASE_URL = "https://api.financialdatasets.ai";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { tickers = [] } = req.body || {};
  if (!tickers.length) return res.status(400).json({ error: "No tickers" });

  const apiKey = process.env.FINANCIAL_DATASETS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "FINANCIAL_DATASETS_API_KEY not configured" });

  const prices = {};

  const promises = tickers.map(async (ticker) => {
    try {
      const url = new URL("/financials/income-statements/", BASE_URL);
      url.searchParams.set("ticker", ticker);
      url.searchParams.set("period", "annual");
      url.searchParams.set("limit", "2");
      const r = await fetch(url.toString(), { headers: { "X-API-KEY": apiKey } });
      if (!r.ok) return { ticker, data: null };
      const d = await r.json();
      const statements = d.income_statements || [];
      if (statements.length > 0) {
        const latest = statements[0];
        const prev = statements[1];
        return {
          ticker,
          data: {
            revenue: latest.revenue,
            netIncome: latest.net_income,
            revenueGrowth: prev && prev.revenue ? ((latest.revenue - prev.revenue) / prev.revenue * 100).toFixed(1) : null,
            period: latest.report_period,
          }
        };
      }
      return { ticker, data: null };
    } catch {
      return { ticker, data: null };
    }
  });

  const settled = await Promise.allSettled(promises);
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value.data) {
      prices[s.value.ticker] = s.value.data;
    }
  }

  res.status(200).json({ prices });
}
