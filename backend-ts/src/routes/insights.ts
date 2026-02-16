import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { sb } from "../supabase";
import { callLLM } from "../llm";
import { requireAuth } from "../middleware";
import type {
  AuthenticatedRequest,
  InsightsData,
  NarrativeRequest,
} from "../types";

const router = Router();

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

/**
 * Attempt to extract valid JSON from an LLM response that may contain
 * markdown fences, prose before/after, or minor formatting issues.
 */
function safeParseLLMJson(raw: string): any {
  // 1. Strip markdown fences
  let text = stripMarkdownFences(raw);

  // 2. Try direct parse first
  try {
    return JSON.parse(text);
  } catch (_) {
    /* continue */
  }

  // 3. Extract first { ... } or [ ... ] block
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch (_) {
      /* continue */
    }

    // 4. Try fixing common issues: control chars, trailing commas
    let cleaned = jsonMatch[1]
      .replace(/[\x00-\x1f]/g, (ch) =>
        ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : ch === "\t" ? "\\t" : "",
      )
      .replace(/,\s*([}\]])/g, "$1"); // trailing commas
    try {
      return JSON.parse(cleaned);
    } catch (_) {
      /* continue */
    }
  }

  // 5. Give up — throw with useful info
  throw new SyntaxError(
    `Could not extract JSON from LLM response (length=${raw.length})`,
  );
}

// ─── Generate Insights ──────────────────────────────────────────

router.post(
  "/insights/generate/:datasetId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = (req as AuthenticatedRequest).user!;
      const dsId = req.params.datasetId;

      const { data: metRows } = await sb
        .from("metrics")
        .select("*")
        .eq("dataset_id", dsId)
        .eq("user_id", user.user_id)
        .limit(1);
      if (!metRows?.length) {
        res.status(404).json({ detail: "Compute metrics first" });
        return;
      }
      const metrics = metRows[0];

      const { data: dsRows } = await sb
        .from("datasets")
        .select("dataset_id, filename, columns")
        .eq("dataset_id", dsId)
        .eq("user_id", user.user_id)
        .limit(1);
      const dataset = (dsRows?.[0] ?? {}) as Record<string, any>;

      const prompt = `You are a strategic startup analyst. Analyze these metrics for a startup and provide actionable insights.

Dataset: ${dataset.filename ?? "Unknown"}
Columns: ${(dataset.columns ?? []).join(", ")}

COMPOSITE SCORES:
- Growth Score: ${metrics.growth_score}/100
- Efficiency Score: ${metrics.efficiency_score}/100
- PMF Signal Score: ${metrics.pmf_signal}/100
- Scalability Index: ${metrics.scalability_index}/100
- Capital Efficiency: ${metrics.capital_efficiency}/100

DETAILED METRICS:
${JSON.stringify(metrics.metrics_detail ?? {}, null, 2)}

Provide your analysis in this EXACT JSON format (no markdown, just raw JSON):
{
  "strategic_insights": [
    {"title": "...", "description": "...", "impact": "high|medium|low", "category": "growth|efficiency|retention|revenue"}
  ],
  "red_flags": [
    {"title": "...", "description": "...", "severity": "critical|warning|info"}
  ],
  "opportunities": [
    {"title": "...", "description": "...", "potential_impact": "...", "priority": "high|medium|low"}
  ],
  "overall_assessment": "A 2-3 sentence strategic summary"
}

Be specific, data-driven, and actionable. Reference actual numbers.`;

      let insightsData: InsightsData;
      try {
        const raw = await callLLM(
          "You are a world-class startup analyst. Always respond with valid JSON only.",
          prompt,
        );
        insightsData = safeParseLLMJson(raw);
      } catch (e: any) {
        console.error("LLM insights error:", e);
        insightsData = {
          strategic_insights: [
            {
              title: "Analysis Error",
              description: String(e),
              impact: "high",
              category: "growth",
            },
          ],
          red_flags: [],
          opportunities: [],
          overall_assessment:
            "Unable to generate full analysis. Please try again.",
        };
      }

      const insightId = `ins_${shortId()}`;
      const insightDoc = {
        insight_id: insightId,
        dataset_id: dsId,
        user_id: user.user_id,
        strategic_insights: insightsData.strategic_insights ?? [],
        red_flags: insightsData.red_flags ?? [],
        opportunities: insightsData.opportunities ?? [],
        overall_assessment: insightsData.overall_assessment ?? "",
        generated_at: new Date().toISOString(),
      };

      await sb
        .from("insights")
        .delete()
        .eq("dataset_id", dsId)
        .eq("user_id", user.user_id);
      await sb.from("insights").insert(insightDoc);
      res.json(insightDoc);
    } catch (err) {
      console.error("Insights error:", err);
      res.status(500).json({ detail: "Internal server error" });
    }
  },
);

// ─── Get Insights ───────────────────────────────────────────────

router.get(
  "/insights/:datasetId",
  requireAuth,
  async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user!;
    const { data } = await sb
      .from("insights")
      .select("*")
      .eq("dataset_id", req.params.datasetId)
      .eq("user_id", user.user_id)
      .limit(1);
    if (!data?.length) {
      res.status(404).json({ detail: "No insights generated yet" });
      return;
    }
    const row = data[0];
    delete row.id;
    res.json(row);
  },
);

// ─── Generate Narrative ─────────────────────────────────────────

const TYPE_PROMPTS: Record<string, string> = {
  traction_statement:
    "Generate a compelling one-line traction statement and a 3-4 sentence expansion that would make a VC want to take a meeting. Focus on the strongest growth signals.",
  vc_email:
    "Generate a professional VC update email. Include: subject line, greeting, key highlights (3-4 bullet points with specific numbers), challenges being addressed, ask/next steps, and sign-off. Make it concise and data-driven.",
  executive_summary:
    "Generate a structured executive summary suitable for a board meeting or investor deck. Include: headline, key metrics summary, growth analysis, efficiency analysis, risks & mitigations, and strategic outlook.",
  monthly_update:
    "Generate a monthly investor update. Include: headline with month context, top 3 wins (with numbers), key metrics table, challenges & learnings, next month priorities, and a funding/runway note.",
};

router.post(
  "/narrative/generate",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = (req as AuthenticatedRequest).user!;
      const body = req.body as NarrativeRequest;
      const {
        dataset_id,
        narrative_type = "traction_statement",
        custom_context,
      } = body;

      const { data: metRows } = await sb
        .from("metrics")
        .select("*")
        .eq("dataset_id", dataset_id)
        .eq("user_id", user.user_id)
        .limit(1);
      if (!metRows?.length) {
        res.status(404).json({ detail: "Compute metrics first" });
        return;
      }
      const metrics = metRows[0];

      const { data: insRows } = await sb
        .from("insights")
        .select("*")
        .eq("dataset_id", dataset_id)
        .eq("user_id", user.user_id)
        .limit(1);
      const insights = insRows?.[0] ?? null;

      const typePrompt =
        TYPE_PROMPTS[narrative_type] ?? TYPE_PROMPTS.traction_statement;

      const prompt = `${typePrompt}

METRICS DATA:
- Growth Score: ${metrics.growth_score}/100
- Efficiency Score: ${metrics.efficiency_score}/100
- PMF Signal: ${metrics.pmf_signal}/100
- Scalability Index: ${metrics.scalability_index}/100
- Capital Efficiency: ${metrics.capital_efficiency}/100

DETAILED METRICS:
${JSON.stringify(metrics.metrics_detail ?? {}, null, 2)}

${insights ? "AI INSIGHTS: " + JSON.stringify(insights.strategic_insights ?? [], null, 2) : ""}
${insights ? "OVERALL ASSESSMENT: " + (insights.overall_assessment ?? "") : ""}
${custom_context ? `ADDITIONAL CONTEXT: ${custom_context}` : ""}

Return your response in this EXACT JSON format (no markdown, just raw JSON):
{
  "title": "Title of this narrative",
  "content": "The full formatted narrative text (use markdown formatting)",
  "type": "${narrative_type}",
  "key_highlights": ["highlight 1", "highlight 2", "highlight 3"]
}`;

      let narrativeData: {
        title: string;
        content: string;
        type: string;
        key_highlights: string[];
      };
      try {
        const raw = await callLLM(
          "You are an elite startup communications strategist. Generate investor-grade content. Always respond with valid JSON only.",
          prompt,
        );
        narrativeData = safeParseLLMJson(raw);
      } catch (e: any) {
        console.error("LLM narrative error:", e);
        narrativeData = {
          title: "Generation Error",
          content: `Unable to generate narrative: ${e}`,
          type: narrative_type,
          key_highlights: [],
        };
      }

      const narrativeId = `nar_${shortId()}`;
      const narrativeDoc = {
        narrative_id: narrativeId,
        dataset_id,
        user_id: user.user_id,
        title: narrativeData.title ?? "",
        content: narrativeData.content ?? "",
        type: narrativeData.type ?? narrative_type,
        key_highlights: narrativeData.key_highlights ?? [],
        generated_at: new Date().toISOString(),
      };

      await sb.from("narratives").insert(narrativeDoc);
      res.json(narrativeDoc);
    } catch (err) {
      console.error("Narrative error:", err);
      res.status(500).json({ detail: "Internal server error" });
    }
  },
);

// ─── List / Get Narratives ──────────────────────────────────────

router.get("/narratives", requireAuth, async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user!;
  const { data } = await sb
    .from("narratives")
    .select("*")
    .eq("user_id", user.user_id)
    .order("generated_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []).map((r: any) => {
    delete r.id;
    return r;
  });
  res.json(rows);
});

router.get(
  "/narratives/:narrativeId",
  requireAuth,
  async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user!;
    const { data } = await sb
      .from("narratives")
      .select("*")
      .eq("narrative_id", req.params.narrativeId)
      .eq("user_id", user.user_id)
      .limit(1);
    if (!data?.length) {
      res.status(404).json({ detail: "Narrative not found" });
      return;
    }
    const row = data[0];
    delete row.id;
    res.json(row);
  },
);

// ─── Dashboard Overview ─────────────────────────────────────────

router.get(
  "/dashboard/overview",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = (req as AuthenticatedRequest).user!;

      const { data: datasets } = await sb
        .from("datasets")
        .select(
          "dataset_id, user_id, filename, columns, numeric_columns, period_column, row_count, uploaded_at",
        )
        .eq("user_id", user.user_id)
        .order("uploaded_at", { ascending: false })
        .limit(50);

      const dsList = datasets ?? [];
      let latestMetrics = null;
      let latestInsights = null;

      if (dsList.length) {
        const latestDs = dsList[0];
        const { data: metRows } = await sb
          .from("metrics")
          .select("*")
          .eq("dataset_id", latestDs.dataset_id)
          .eq("user_id", user.user_id)
          .limit(1);
        if (metRows?.length) {
          latestMetrics = metRows[0];
          delete latestMetrics.id;
        }

        const { data: insRows } = await sb
          .from("insights")
          .select("*")
          .eq("dataset_id", latestDs.dataset_id)
          .eq("user_id", user.user_id)
          .limit(1);
        if (insRows?.length) {
          latestInsights = insRows[0];
          delete latestInsights.id;
        }
      }

      const { data: narRows } = await sb
        .from("narratives")
        .select("*")
        .eq("user_id", user.user_id)
        .order("generated_at", { ascending: false })
        .limit(5);
      const recentNarratives = (narRows ?? []).map((r: any) => {
        delete r.id;
        return r;
      });

      const { count } = await sb
        .from("narratives")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.user_id);

      res.json({
        datasets: dsList,
        latest_metrics: latestMetrics,
        latest_insights: latestInsights,
        recent_narratives: recentNarratives,
        total_datasets: dsList.length,
        total_narratives: count ?? 0,
      });
    } catch (err) {
      console.error("Dashboard error:", err);
      res.status(500).json({ detail: "Internal server error" });
    }
  },
);

export default router;
