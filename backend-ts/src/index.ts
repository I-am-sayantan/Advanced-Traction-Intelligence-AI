import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config";
import authRouter from "./routes/auth";
import dataRouter from "./routes/data";
import insightsRouter from "./routes/insights";
import updatesRouter from "./routes/updates";
import contactsRouter from "./routes/contacts";
import emailRouter from "./routes/email";

const app = express();

// ─── Middleware ──────────────────────────────────────────────────

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Routes ─────────────────────────────────────────────────────

app.use("/api/auth", authRouter);
app.use("/api/data", dataRouter);
app.use("/api", insightsRouter); // /api/insights/*, /api/narrative/*, /api/narratives/*, /api/dashboard/*
app.use("/api/updates", updatesRouter);
app.use("/api/contacts", contactsRouter);
app.use("/api/email", emailRouter);

// ─── Health ─────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "Founder Intelligence Platform" });
});

// ─── Metrics routes (forwarded from data router) ────────────────

// The data router already handles /api/data/metrics/* routes,
// but the frontend calls /api/metrics/* directly. Add aliases:

import { requireAuth } from "./middleware";
import { sb } from "./supabase";
import { computeGrowthMetrics } from "./metrics";
import { v4 as uuidv4 } from "uuid";
import type { AuthenticatedRequest } from "./types";
import { Request, Response } from "express";

function shortId(): string {
  return uuidv4().replace(/-/g, "").slice(0, 12);
}

app.post(
  "/api/metrics/compute/:datasetId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = (req as AuthenticatedRequest).user!;
      const dsId = req.params.datasetId;
      const { data: ds } = await sb
        .from("datasets")
        .select("*")
        .eq("dataset_id", dsId)
        .eq("user_id", user.user_id)
        .limit(1);
      if (!ds?.length) {
        res.status(404).json({ detail: "Dataset not found" });
        return;
      }
      const dataset = ds[0];
      const result = computeGrowthMetrics(
        dataset.data,
        dataset.numeric_columns,
      );
      const metricsId = `met_${shortId()}`;
      const metricsDoc = {
        metrics_id: metricsId,
        dataset_id: dsId,
        user_id: user.user_id,
        ...result,
        computed_at: new Date().toISOString(),
      };
      await sb
        .from("metrics")
        .delete()
        .eq("dataset_id", dsId)
        .eq("user_id", user.user_id);
      await sb.from("metrics").insert(metricsDoc);
      res.json(metricsDoc);
    } catch (err) {
      console.error("Metrics compute error:", err);
      res.status(500).json({ detail: "Internal server error" });
    }
  },
);

app.get(
  "/api/metrics/:datasetId",
  requireAuth,
  async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user!;
    const { data } = await sb
      .from("metrics")
      .select(
        "metrics_id, dataset_id, user_id, growth_score, efficiency_score, pmf_signal, scalability_index, capital_efficiency, metrics_detail, trends, computed_at",
      )
      .eq("dataset_id", req.params.datasetId)
      .eq("user_id", user.user_id)
      .limit(1);
    if (!data?.length) {
      res.status(404).json({ detail: "Metrics not computed yet" });
      return;
    }
    res.json(data[0]);
  },
);

// ─── Start ──────────────────────────────────────────────────────

app.listen(config.port, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://localhost:${config.port}`);
  console.log(`📚 Health check: http://localhost:${config.port}/api/health`);
});

export default app;
