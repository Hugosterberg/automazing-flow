export function registerAiRoutes(app) {
  // --- AI-analys av konto ---
  app.post("/api/accounts/:accountId/analyze", async (req, res) => {
    const { captions = [], displayName = "", username = "", followersCount } = req.body;
    const openaiKey = (process.env.OPENAI_API_KEY || "").trim();

    // Helper: smart keyword analysis as fallback
    function keywordAnalysis() {
      const allText = captions.join(" ").toLowerCase();
      const words = allText.match(/\b\w{4,}\b/g) || [];
      const freq: Record<string, number> = {};
      for (const w of words) freq[w] = (freq[w] || 0) + 1;
      const stopwords = new Set(["this","that","with","from","have","they","been","your","will","just","more","into","than","its","are","for","the","and","but","not","you","all","can","her","was","one","our","out","day","get","has","him","his","how","man","new","now","old","see","two","way","who","boy","did","its","let","put","say","she","too","use","com","www"]);
      const topWords = Object.entries(freq)
        .filter(([w]) => !stopwords.has(w))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([w]) => w);
      const hashtags = [...new Set((captions.join(" ").match(/#\w+/g) || []).map(h => h.toLowerCase()))]
        .slice(0, 8).map(h => h.replace("#", ""));

      const mainTopic = topWords.slice(0, 3).join(", ");
      const hashtagStr = hashtags.slice(0, 5).join(", ") || mainTopic;
      const n = followersCount ? `with ${Number(followersCount).toLocaleString("en-US")} followers` : "";
      return {
        about: `@${username} ${n} is an account focused on ${mainTopic}. The content revolves around a personal journey and shares experiences within this area.`,
        writes: `The account posts about ${hashtagStr}. Common post types include updates, quotes and milestones related to the main topic.`,
        perception: `An outside person sees an engaged account with a clear focus and consistent message. The account appears driven by passion rather than commercial intent.`,
      };
    }

    if (!openaiKey) {
      return res.json(keywordAnalysis());
    }

    try {
      const captionSample = captions.slice(0, 25).join("\n---\n");
      const prompt = `You are a social media analyst. Analyze this Instagram account briefly and factually in English.

Account: @${username} – "${displayName}"
Followers: ${followersCount ? Number(followersCount).toLocaleString("en-US") : "unknown"}

Recent post captions (sample):
${captionSample}

Reply with exactly these three points. Keep each answer to 1–2 short sentences. No headings, no lists – only flowing text.

ABOUT: [What the account is about – niche, theme and purpose]
WRITES ABOUT: [Concrete topics, events and types of content that appear]
PERCEPTION: [How a regular person with no prior knowledge of the topic would describe and perceive the account]`;

      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.6,
          max_tokens: 350,
        }),
      });

      if (!aiRes.ok) {
        console.warn("[AI] OpenAI responded", aiRes.status, "– using fallback");
        return res.json(keywordAnalysis());
      }

      const aiData = await aiRes.json();
      const text = aiData.choices?.[0]?.message?.content || "";

      // Parse the three parts from the response
      const extract = (label: string) => {
        const match = text.match(new RegExp(`${label}:\\s*(.+?)(?=\\n[A-Z ]+:|$)`, "si"));
        return match ? match[1].trim() : null;
      };
      const about = extract("ABOUT");
      const writes = extract("WRITES ABOUT") || extract("WRITES");
      const perception = extract("PERCEPTION");

      if (about && writes && perception) {
        return res.json({ about, writes, perception });
      }
      // Strukturen var inte rätt – returnera hela texten uppdelad
      const lines = text.split("\n").filter(l => l.trim()).slice(0, 3);
      return res.json({
        about: lines[0] || text.slice(0, 150),
        writes: lines[1] || "",
        perception: lines[2] || "",
      });
    } catch (err) {
      console.error("[AI] Analysfel:", (err as Error).message);
      return res.json(keywordAnalysis());
    }
  });
}
