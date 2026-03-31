import crypto from "crypto";

type AiRouteDeps = {
  getSessionUserId?: (req: { [key: string]: unknown }) => string | null;
  tokenStore?: {
    get?: (accountId: string) => { ownerUserId?: string; [key: string]: unknown } | undefined;
    set?: (accountId: string, value: { [key: string]: unknown }) => unknown;
  };
};

export function registerAiRoutes(app, deps?: AiRouteDeps) {
  app.post("/api/mail/summaries", async (req, res) => {
    const userId = deps?.getSessionUserId?.(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const body = (req.body ?? {}) as {
      messages?: Array<{
        id?: string;
        subject?: string;
        snippet?: string;
        from?: { name?: string; email?: string };
      }>;
    };
    const messages = Array.isArray(body.messages) ? body.messages.slice(0, 20) : [];
    if (messages.length === 0) {
      return res.json({ summaries: {} });
    }

    const heuristicSummary = (m: { subject?: string; snippet?: string; from?: { name?: string; email?: string } }) => {
      const who = m.from?.name || m.from?.email || "Avsandare";
      const text = `${m.subject || ""} ${m.snippet || ""}`.replace(/\s+/g, " ").trim();
      if (!text) return `${who}: uppdatering utan tydlig beskrivning.`;
      return `${who}: ${text.slice(0, 95)}${text.length > 95 ? "..." : ""}`;
    };

    const openaiKey = (process.env.OPENAI_API_KEY || "").trim();
    if (!openaiKey) {
      const summaries = Object.fromEntries(
        messages.map((m) => [String(m.id || crypto.randomUUID()), heuristicSummary(m)])
      );
      return res.json({ summaries });
    }

    try {
      const compact = messages.map((m) => ({
        id: String(m.id || ""),
        subject: String(m.subject || ""),
        snippet: String(m.snippet || ""),
        from: m.from?.name || m.from?.email || "",
      }));

      const prompt = `Sammanfatta varje mail kort på svenska i max 10 ord per mail.\nReturnera ENDAST JSON i formatet {"summaries":{"<id>":"<kort sammanfattning>"}}.\n\nMeddelanden:\n${JSON.stringify(compact)}`;
      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 600,
          response_format: { type: "json_object" },
        }),
      });

      if (!aiRes.ok) {
        const summaries = Object.fromEntries(
          messages.map((m) => [String(m.id || crypto.randomUUID()), heuristicSummary(m)])
        );
        return res.json({ summaries });
      }

      const aiData = await aiRes.json();
      const content = aiData?.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content) as { summaries?: Record<string, string> };
      const summaries = parsed?.summaries ?? {};

      // Ensure every message has a summary.
      for (const m of messages) {
        const id = String(m.id || "");
        if (id && !summaries[id]) summaries[id] = heuristicSummary(m);
      }
      return res.json({ summaries });
    } catch {
      const summaries = Object.fromEntries(
        messages.map((m) => [String(m.id || crypto.randomUUID()), heuristicSummary(m)])
      );
      return res.json({ summaries });
    }
  });

  app.post("/api/content/video-draft", async (req, res) => {
    const userId = deps?.getSessionUserId?.(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const body = (req.body ?? {}) as {
      asset?: {
        id?: string;
        name?: string;
        mimeType?: string;
        kind?: string;
        webViewLink?: string;
      };
      prompt?: string;
      platform?: string;
      objective?: string;
    };

    const asset = body.asset ?? {};
    const assetName = String(asset.name || "Source video").trim();
    const mimeType = String(asset.mimeType || "video/mp4").trim();
    const platform = String(body.platform || "Instagram Reels").trim();
    const objective = String(body.objective || "Create a short social media video").trim();
    const prompt = String(body.prompt || "").trim();
    const openaiKey = (process.env.OPENAI_API_KEY || "").trim();

    const fallbackDraft = {
      title: `${platform} concept for ${assetName}`,
      hook: `Start with the strongest visual moment from ${assetName} in the first two seconds.`,
      concept: `${objective}. Use the original video as the core asset and build a short edit optimized for ${platform}.`,
      shots: [
        `Opening: lead with the clearest moment from ${assetName}.`,
        "Middle: add one proof point, reaction, or detail shot that supports the message.",
        "Ending: close with a clear CTA overlay and brand tag.",
      ],
      caption: `Turn ${assetName} into a concise ${platform} post with one clear message and one CTA.`,
      cta: "End with a simple CTA that matches the platform and campaign goal.",
    };

    if (!openaiKey) {
      return res.json({ draft: fallbackDraft, source: "fallback" });
    }

    try {
      const promptText = [
        "Create a short social media video brief as JSON.",
        'Return exactly: {"title":"","hook":"","concept":"","shots":["","",""],"caption":"","cta":""}.',
        `Platform: ${platform}`,
        `Objective: ${objective}`,
        `Source asset name: ${assetName}`,
        `Source mime type: ${mimeType}`,
        prompt ? `Extra direction: ${prompt}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: promptText }],
          temperature: 0.7,
          max_tokens: 500,
          response_format: { type: "json_object" },
        }),
      });

      if (!aiRes.ok) {
        return res.json({ draft: fallbackDraft, source: "fallback" });
      }

      const aiData = await aiRes.json();
      const content = aiData?.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content) as {
        title?: string;
        hook?: string;
        concept?: string;
        shots?: string[];
        caption?: string;
        cta?: string;
      };

      return res.json({
        draft: {
          title: String(parsed.title || fallbackDraft.title),
          hook: String(parsed.hook || fallbackDraft.hook),
          concept: String(parsed.concept || fallbackDraft.concept),
          shots: Array.isArray(parsed.shots) && parsed.shots.length > 0 ? parsed.shots.slice(0, 5) : fallbackDraft.shots,
          caption: String(parsed.caption || fallbackDraft.caption),
          cta: String(parsed.cta || fallbackDraft.cta),
        },
        source: "openai",
      });
    } catch {
      return res.json({ draft: fallbackDraft, source: "fallback" });
    }
  });

  // --- AI-analys av konto ---
  app.post("/api/accounts/:accountId/analyze", async (req, res) => {
    const userId = deps?.getSessionUserId?.(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const accountId = String(req.params?.accountId || "");
    const stored = accountId ? deps?.tokenStore?.get?.(accountId) : null;
    if (stored) {
      if (stored.ownerUserId && stored.ownerUserId !== userId) {
        const isLocalPair =
          String(stored.ownerUserId).startsWith("local_") && String(userId).startsWith("local_");
        if (!isLocalPair) {
          return res.status(404).json({ error: "Account not connected" });
        }
        if (deps?.tokenStore?.set) {
          deps.tokenStore.set(accountId, { ...stored, ownerUserId: userId });
        }
      } else if (!stored.ownerUserId && deps?.tokenStore?.set) {
        deps.tokenStore.set(accountId, { ...stored, ownerUserId: userId });
      }
    }

    const body = (req.body ?? {}) as {
      captions?: string[];
      displayName?: string;
      username?: string;
      followersCount?: number;
    };
    const { captions = [], displayName = "", username = "", followersCount } = body;
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
      const hashMatches: string[] = captions.join(" ").match(/#\w+/g) || [];
      const hashtags = [...new Set(hashMatches.map((h) => h.toLowerCase()))]
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
