import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import { sb } from "../supabase";
import { callLLM } from "../llm";
import { requireAuth } from "../middleware";
import type { AuthenticatedRequest, UpdateAnalysis } from "../types";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function shortId(): string {
  return uuidv4().replace(/-/g, "").slice(0, 12);
}

function stripMarkdownFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.split("\n").slice(1).join("\n");
    t = t.replace(/```\s*$/, "");
  }
  return t.trim();
}

// ─── Create Update ──────────────────────────────────────────────

router.post(
  "/",
  requireAuth,
  upload.any(),
  async (req: Request, res: Response) => {
    try {
      const user = (req as AuthenticatedRequest).user!;
      let content: string;
      let tags: string[];
      const images: { data: string; type: string; name: string }[] = [];

      if (req.is("multipart/form-data")) {
        content = (req.body.content as string) ?? "";
        const tagsRaw = (req.body.tags as string) ?? "";
        tags = tagsRaw
          ? tagsRaw
              .split(",")
              .map((t: string) => t.trim())
              .filter(Boolean)
          : [];
        const files = (req.files as Express.Multer.File[]) ?? [];
        for (const f of files) {
          if (f.fieldname.startsWith("image")) {
            images.push({
              data: f.buffer.toString("base64"),
              type: f.mimetype || "image/png",
              name: f.originalname,
            });
          }
        }
      } else {
        content = req.body.content ?? "";
        tags = req.body.tags ?? [];
        // images from JSON body
        if (req.body.images) images.push(...req.body.images);
      }

      const updateId = `upd_${shortId()}`;
      const updateDoc = {
        update_id: updateId,
        user_id: user.user_id,
        title: req.body.title ?? "",
        content,
        category: req.body.category ?? "general",
        images,
        tags,
        created_at: new Date().toISOString(),
      };
      const { error: insertErr } = await sb.from("updates").insert(updateDoc);
      if (insertErr) {
        console.error("Update insert error:", insertErr);
        res.status(500).json({ detail: `Insert failed: ${insertErr.message}` });
        return;
      }
      res.json(updateDoc);
    } catch (err) {
      console.error("Create update error:", err);
      res.status(500).json({ detail: "Internal server error" });
    }
  },
);

// ─── List Updates ───────────────────────────────────────────────

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user!;
  const { data } = await sb
    .from("updates")
    .select("*")
    .eq("user_id", user.user_id)
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []).map((r: any) => {
    delete r.id;
    return r;
  });
  res.json(rows);
});

// ─── Get Update ─────────────────────────────────────────────────

router.get("/:updateId", requireAuth, async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user!;
  const { data } = await sb
    .from("updates")
    .select("*")
    .eq("update_id", req.params.updateId)
    .eq("user_id", user.user_id)
    .limit(1);
  if (!data?.length) {
    res.status(404).json({ detail: "Update not found" });
    return;
  }
  const row = data[0];
  delete row.id;
  res.json(row);
});

// ─── Delete Update ──────────────────────────────────────────────

router.delete(
  "/:updateId",
  requireAuth,
  async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user!;
    const { data } = await sb
      .from("updates")
      .delete()
      .eq("update_id", req.params.updateId)
      .eq("user_id", user.user_id)
      .select();
    if (!data?.length) {
      res.status(404).json({ detail: "Update not found" });
      return;
    }
    res.json({ ok: true });
  },
);

// ─── AI Analyze Updates ─────────────────────────────────────────

router.post("/ai-analyze", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const days = req.body.days ?? 7;
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

    const { data: updates } = await sb
      .from("updates")
      .select("update_id, user_id, content, tags, created_at")
      .eq("user_id", user.user_id)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!updates?.length) {
      res.status(404).json({ detail: "No updates in this period" });
      return;
    }

    // Get latest metrics
    let latestMetrics: any = null;
    const { data: latestDs } = await sb
      .from("datasets")
      .select("dataset_id")
      .eq("user_id", user.user_id)
      .order("uploaded_at", { ascending: false })
      .limit(1);
    if (latestDs?.length) {
      const { data: metRows } = await sb
        .from("metrics")
        .select(
          "growth_score, efficiency_score, pmf_signal, scalability_index, capital_efficiency",
        )
        .eq("dataset_id", latestDs[0].dataset_id)
        .eq("user_id", user.user_id)
        .limit(1);
      if (metRows?.length) latestMetrics = metRows[0];
    }

    const updatesText = updates
      .map((u: any) => {
        const tagStr = u.tags?.length ? ` (tags: ${u.tags.join(", ")})` : "";
        return `[${u.created_at.slice(0, 10)}] ${u.content}${tagStr}`;
      })
      .join("\n\n");

    let metricsContext = "";
    if (latestMetrics) {
      metricsContext = `
CURRENT METRICS:
- Growth Score: ${latestMetrics.growth_score ?? "N/A"}/100
- Efficiency Score: ${latestMetrics.efficiency_score ?? "N/A"}/100
- PMF Signal: ${latestMetrics.pmf_signal ?? "N/A"}/100
- Scalability Index: ${latestMetrics.scalability_index ?? "N/A"}/100
- Capital Efficiency: ${latestMetrics.capital_efficiency ?? "N/A"}/100`;
    }

    const prompt = `You are a strategic startup advisor analyzing a founder's recent journal entries/updates.

FOUNDER UPDATES (${updates.length} entries from last ${days} days):
${updatesText}

${metricsContext}

Analyze these updates and provide a comprehensive summary. Return EXACT JSON (no markdown):
{
  "summary": "2-3 sentence overview of what's been happening",
  "key_themes": ["theme1", "theme2", "theme3"],
  "momentum_signal": "positive|neutral|negative",
  "suggested_metrics_to_track": ["metric1", "metric2"],
  "recommended_update_for_investors": "A polished 3-4 sentence investor-ready update based on these journal entries",
  "action_items": ["action1", "action2", "action3"],
  "trend_observations": [
    {"observation": "...", "implication": "...", "priority": "high|medium|low"}
  ]
}

Be specific, reference actual details from the updates. Think like a VC-advisor hybrid.`;

    let analysis: UpdateAnalysis;
    try {
      const raw = await callLLM(
        "You are a startup strategic advisor. Always respond with valid JSON only.",
        prompt,
      );
      analysis = JSON.parse(stripMarkdownFences(raw));
    } catch (e: any) {
      console.error("LLM update analysis error:", e);
      analysis = {
        summary: `Analysis error: ${e}`,
        key_themes: [],
        momentum_signal: "neutral",
        suggested_metrics_to_track: [],
        recommended_update_for_investors: "",
        action_items: [],
        trend_observations: [],
      };
    }

    res.json({
      analysis,
      updates_analyzed: updates.length,
      period_days: days,
      analyzed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("AI analyze error:", err);
    res.status(500).json({ detail: "Internal server error" });
  }
});

export default router;
