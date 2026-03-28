export const ADVISORS = {
  analyst: { n: "Systematic Analyst", s: "Analyst", i: "📊", c: "#4A7C5C", g: "linear-gradient(135deg,#2D4A3E,#4A7C5C)", d: "Macro, sectors, valuation, risk", cat: "specialists" },
  buffett: { n: "Warren Buffett", s: "Buffett", i: "🎩", c: "#3B6BA5", g: "linear-gradient(135deg,#2A4F7A,#3B6BA5)", d: "Moats, compounding, patience", cat: "legends" },
  munger: { n: "Charlie Munger", s: "Munger", i: "📚", c: "#8B5E3C", g: "linear-gradient(135deg,#6B4226,#8B5E3C)", d: "Mental models, inversion, honesty", cat: "legends" },
  technical: { n: "Technical Trader", s: "Technical", i: "📈", c: "#E06C75", g: "linear-gradient(135deg,#A84040,#E06C75)", d: "Charts, setups, risk-reward", cat: "specialists" },
  crypto: { n: "Crypto Strategist", s: "Crypto", i: "🔗", c: "#61AFEF", g: "linear-gradient(135deg,#3A7BD5,#61AFEF)", d: "On-chain, tokenomics, DeFi", cat: "specialists" },
  esg: { n: "ESG Analyst", s: "ESG", i: "🌍", c: "#98C379", g: "linear-gradient(135deg,#5E8A3E,#98C379)", d: "Sustainability, governance, impact", cat: "specialists" },
  dalio: { n: "Ray Dalio", s: "Dalio", i: "🌊", c: "#56B6C2", g: "linear-gradient(135deg,#2E8B8B,#56B6C2)", d: "Macro cycles, risk parity", cat: "legends" },
  lynch: { n: "Peter Lynch", s: "Lynch", i: "🛒", c: "#D19A66", g: "linear-gradient(135deg,#A07040,#D19A66)", d: "Invest in what you know", cat: "legends" },
  income: { n: "Income Strategist", s: "Income", i: "💰", c: "#C678DD", g: "linear-gradient(135deg,#8E4EC6,#C678DD)", d: "Dividends, yield, cash flow", cat: "specialists" },
  contrarian: { n: "Contrarian Value", s: "Contrarian", i: "🔄", c: "#BE5046", g: "linear-gradient(135deg,#8B3A32,#BE5046)", d: "Deep value, margin of safety", cat: "specialists" },
};

export const ADVISOR_KEYS = Object.keys(ADVISORS);

export const TICKERS = ["AAPL","MSFT","NVDA","GOOGL","AMZN","TSLA","META","AVGO","TSM","LLY","MELI","COST","AMD","INTC","QCOM","V","MA","JPM","UNH","XOM","JNJ","PG","KO","PEP","WMT","NFLX","CRM","ASML","MRK","ABBV"];

export const SUGGESTED = [
  "Is the AI boom a bubble or structural shift?",
  "Build me a resilient portfolio for the next decade",
  "What are the strongest competitive moats today?",
  "How should I think about nuclear energy investments?",
  "What's the biggest risk investors are ignoring?",
  "Evaluate $AAPL as a long-term investment",
  "What crypto tokens have real utility beyond speculation?",
  "Which dividend stocks can grow payouts for 20+ years?",
];
