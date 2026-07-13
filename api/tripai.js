// Penasihat budget trip — nada santai, praktis, gak nge-judge.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { summary } = req.body || {};
  if (!summary || typeof summary !== "string" || summary.length > 6000)
    return res.status(400).json({ error: "Invalid input" });

  const prompt = `Kamu teman perjalanan yang jago atur duit, bahasa Indonesia santai (lu/gue). Ini kondisi keuangan sebuah trip:

${summary}

Kasih rekomendasi SINGKAT (maks 5 kalimat): sisa budget-nya cukup gak untuk sisa harinya, prioritasin buat apa (transport/makan dulu), dan apa yang sebaiknya ditahan. Praktis dan spesifik ke angkanya. Jangan nge-judge pengeluaran yang udah lewat. Boleh 1 emoji.`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1000, temperature: 0.6, thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    );
    const data = await r.json();
    const advice = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!advice) return res.status(502).json({ error: "No advice" });
    return res.status(200).json({ advice });
  } catch {
    return res.status(500).json({ error: "AI request failed" });
  }
}
