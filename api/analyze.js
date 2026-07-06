// Analisis pengeluaran via Gemini — nada santai, TANPA nge-judge.
// Pakai GEMINI_API_KEY yang sama dengan /api/suggest.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { rows } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 300) {
    return res.status(400).json({ error: "Invalid input" });
  }

  // rapiin data biar hemat token
  const lines = rows
    .map(
      (r) =>
        `${r.spent_date} | ${r.kind === "in" ? "MASUK" : "keluar"} | Rp${r.amount} | ${r.source}${r.note ? " | " + r.note : ""}`,
    )
    .join("\n");

  const prompt = `Kamu teman yang santai dan suportif, bahasa Indonesia gaul (lu/gue). Ini catatan keuangan 30 hari terakhir seseorang:

${lines}

Tugas lu:
1. Rangkum duitnya kemana aja (kelompokkin sendiri dari catatannya, misal makan, transport, dll) — singkat, 2-3 poin.
2. Kasih 1-2 saran hemat yang REALISTIS dan santai.

ATURAN PENTING:
- JANGAN nge-judge atau bikin dia ngerasa bersalah. Gak ada kata "boros", "kebanyakan", "harusnya".
- Nada: kayak temen yang ngobrol, bukan financial advisor.
- Kalau datanya dikit, bilang aja santai datanya masih dikit.
- Maksimal 6 kalimat total. Boleh 1 emoji.`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 1500,
            temperature: 0.7,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );
    const data = await r.json();
    const analysis = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!analysis) return res.status(502).json({ error: "No analysis" });
    return res.status(200).json({ analysis });
  } catch (e) {
    return res.status(500).json({ error: "AI request failed" });
  }
}
