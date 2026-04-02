const BASE_URL = "https://api.financialdatasets.ai";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { tickers = [] } = req.body || {};
  if (!tickers.length) return res.status(400).json({ error: "No tickers" });

  const apiKey = process.env.FINANCIAL_DATASETS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "FINANCIAL_DATASETS_API_KEY not configured" });

  const quotes = {};

  const promises = tickers.map(async (ticker) => {
    try {
      const url = new URL("/stock-prices", BASE_URL);
      url.searchParams.set("ticker", ticker.toUpperCase());
      url.searchParams.set("interval", "day");
      url.searchParams.set("interval_multiplier", "1");
      url.searchParams.set("limit", "2");
      const r = await fetch(url.toString(), { headers: { "X-API-KEY": apiKey } });
      if (!r.ok) return { ticker, data: null };
      const d = await r.json();
      const prices = d.stock_prices || [];
      if (prices.length > 0) {
        const latest = prices[0];
        const prev = prices[1];
        const price = latest.close;
        const prevClose = prev ? prev.close : price;
        const change = price - prevClose;
        const changePercent = prevClose ? ((change / prevClose) * 100) : 0;
        return {
          ticker: ticker.toUpperCase(),
          data: {
            price,
            open: latest.open,
            high: latest.high,
            low: latest.low,
            volume: latest.volume,
            change: parseFloat(change.toFixed(2)),
            changePercent: parseFloat(changePercent.toFixed(2)),
            date: latest.time || latest.date,
          },
        };
      }
      return { ticker: ticker.toUpperCase(), data: null };
    } catch {
      return { ticker: ticker.toUpperCase(), data: null };
    }
  });

  const settled = await Promise.allSettled(promises);
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value.data) {
      quotes[s.value.ticker] = s.value.data;
    }
  }

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");
  res.status(200).json({ quotes });
}
