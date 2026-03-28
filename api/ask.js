const Anthropic = require("@anthropic-ai/sdk");
const { ADVISORS } = require("./lib/advisors");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { question, advisors = ["analyst", "buffett", "munger"], financialContext = "", conversationHistory = [] } = req.body || {};
  if (!question) return res.status(400).json({ error: "No question" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  const anthropic = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  const q = financialContext ? `${financialContext}\n\n---\nBased on the data above:\n${question}` : question;

  const validAdvisors = advisors.filter(k => ADVISORS[k]);

  const promises = validAdvisors.map(async (key) => {
    try {
      const messages = [];
      const history = (conversationHistory[key] || []).slice(-20);
      for (const msg of history) {
        messages.push({ role: msg.role, content: msg.content });
      }
      messages.push({ role: "user", content: q });

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1200,
        system: ADVISORS[key].system,
        messages,
      });
      const text = response.content.filter(b => b.type === "text").map(b => b.text).join("\n");
      return { key, result: { ok: true, text, name: ADVISORS[key].name, icon: ADVISORS[key].icon } };
    } catch (err) {
      return { key, result: { ok: false, text: `Error: ${err.message}`, name: ADVISORS[key].name, icon: ADVISORS[key].icon } };
    }
  });

  const settled = await Promise.allSettled(promises);
  const results = {};
  for (const s of settled) {
    if (s.status === "fulfilled") {
      results[s.value.key] = s.value.result;
    }
  }

  res.status(200).json({ results });
};
