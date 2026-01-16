const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors({
  origin: "https://elviorajewelry.lovestoblog.com",
  credentials: false
}));

app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-r1-0528:free";

const PRODUCTS_URL =
  process.env.PRODUCTS_URL ||
  "https://elviorajewelry.lovestoblog.com/actions/get_products.php?limit=200&offset=0";

const PRODUCTS_CACHE_MS = 5 * 60 * 1000;

const SYSTEM_PROMPT = `
You are the Elviora jewelry store assistant.
Reply in the same language as the user.
Be concise and helpful.
Never invent information.
`;

const SYSTEM_FACTS = `
Store name: Elviora Jewelry.
Location: Damascus, Syria.
Phone: 09998841365.
Exchange within 48 hours.
Payment on delivery inside Syria.
`;

let productCache = {
  at: 0,
  text: ""
};

function buildProductsText(products) {
  if (!Array.isArray(products)) return "";
  return products.map(p => {
    return `- ${p.name || "منتج"} | ${p.category_name || "غير محدد"} | ${p.price_usd || ""}$`;
  }).join("\n");
}

async function getProductsContext() {
  const now = Date.now();
  if (productCache.text && now - productCache.at < PRODUCTS_CACHE_MS) {
    return productCache.text;
  }

  try {
    const res = await fetch(PRODUCTS_URL);
    const data = await res.json();
    if (!data.ok) return productCache.text || "";

    productCache.text = buildProductsText(data.products);
    productCache.at = now;
    return productCache.text;
  } catch {
    return productCache.text || "";
  }
}

app.post("/api/chat", async (req, res) => {
  const message = (req.body.message || "").trim();
  if (!message) {
    return res.status(400).json({ ok: false });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ ok: false, error: "NO_API_KEY" });
  }

  const productsText = await getProductsContext();

  const payload = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT + SYSTEM_FACTS },
      { role: "system", content: "KNOWN_PRODUCTS:\n" + productsText },
      { role: "user", content: message }
    ],
    temperature: 0.4,
    max_tokens: 300
  };

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || "";

    return res.json({ ok: true, reply });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "AI_FAILED" });
  }
});

app.get("/", (req, res) => {
  res.json({ ok: true, status: "ready" });
});

app.listen(PORT, () => {
  console.log("Elviora chat API running on port", PORT);
});