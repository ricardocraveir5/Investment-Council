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

/**
 * Stream advisor responses via SSE.
 * Returns an AbortController so the caller can cancel.
 */
export function streamAdvisors({ question, advisors, ticker, conversationHistory, onStart, onDelta, onDone, onError, onFinancial, onComplete }) {
  const controller = new AbortController();
  const body = { question, advisors, conversationHistory };
  if (ticker) body.ticker = ticker;

  (async () => {
    try {
      const response = await fetch("/api/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Stream failed" }));
        onError?.({ advisor: null, text: err.error || "Stream failed" });
        onComplete?.();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop(); // keep incomplete chunk

        for (const part of parts) {
          if (!part.trim()) continue;
          const lines = part.split("\n");
          let eventType = "";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7);
            else if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (!eventType || !data) continue;

          try {
            const parsed = JSON.parse(data);
            switch (eventType) {
              case "start": onStart?.(parsed); break;
              case "delta": onDelta?.(parsed); break;
              case "done": onDone?.(parsed); break;
              case "error": onError?.(parsed); break;
              case "financial": onFinancial?.(parsed); break;
              case "complete": onComplete?.(); break;
            }
          } catch { /* skip malformed JSON */ }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const lines = buffer.split("\n");
        let eventType = "";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) eventType = line.slice(7);
          else if (line.startsWith("data: ")) data = line.slice(6);
        }
        if (eventType && data) {
          try {
            const parsed = JSON.parse(data);
            if (eventType === "complete") onComplete?.();
            else if (eventType === "delta") onDelta?.(parsed);
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        onError?.({ advisor: null, text: err.message });
      }
      onComplete?.();
    }
  })();

  return controller;
}

export async function fetchPrices(tickers) {
  const r = await fetch("/api/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tickers }) });
  return r.json();
}

export async function analyzePortfolio(positions, advisor) {
  const r = await fetch("/api/analyze-portfolio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positions, advisor }) });
  return r.json();
}
