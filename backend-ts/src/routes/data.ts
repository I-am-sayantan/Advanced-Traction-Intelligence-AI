import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import Papa from "papaparse";
import XLSX from "xlsx";
import multer from "multer";
import { sb } from "../supabase";
import { requireAuth } from "../middleware";
import { computeGrowthMetrics } from "../metrics";
import type { AuthenticatedRequest } from "../types";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ─── Helpers ────────────────────────────────────────────────────

function shortId(): string {
  return uuidv4().replace(/-/g, "").slice(0, 12);
}

interface ParsedData {
  records: Record<string, unknown>[];
  columns: string[];
  numericCols: string[];
  periodCol: string | null;
}

function parseFile(buffer: Buffer, filename: string): ParsedData {
  let records: Record<string, unknown>[];

  if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  } else {
    const csv = buffer.toString("utf-8");
    const parsed = Papa.parse<Record<string, unknown>>(csv, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    });
    records = parsed.data;
  }

  if (!records.length) throw new Error("File is empty or has no valid rows");

  // Normalize column names
  const rawCols = Object.keys(records[0]);
  const colMap: Record<string, string> = {};
  for (const c of rawCols) {
    colMap[c] = c.trim().toLowerCase().replace(/ /g, "_");
  }
  records = records.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [orig, norm] of Object.entries(colMap)) {
      out[norm] = r[orig];
    }
    return out;
  });

  const columns = Object.values(colMap);

  // Detect numeric columns
  const numericCols = columns.filter((col) => {
    return records.some((r) => {
      const v = r[col];
      return (
        typeof v === "number" ||
        (typeof v === "string" && !isNaN(Number(v)) && v.trim() !== "")
      );
    });
  });

  // Detect period column
  const periodKeywords = ["date", "month", "period", "time", "year", "quarter"];
  const periodCol =
    columns.find((c) => periodKeywords.some((kw) => c.includes(kw))) ?? null;

  return { records, columns, numericCols, periodCol };
}

// ─── Upload ─────────────────────────────────────────────────────

router.post(
  "/upload",
  requireAuth,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const user = (req as AuthenticatedRequest).user!;
      const file = req.file;
      if (!file) {
        res.status(400).json({ detail: "No file uploaded" });
        return;
      }
      const filename = file.originalname || "upload.csv";

      let parsed: ParsedData;
      try {
        parsed = parseFile(file.buffer, filename);
      } catch (e: any) {
        res.status(400).json({ detail: `Could not parse file: ${e.message}` });
        return;
      }

      const datasetId = `ds_${shortId()}`;
      const datasetDoc = {
        dataset_id: datasetId,
        user_id: user.user_id,
        filename,
        columns: parsed.columns,
        numeric_columns: parsed.numericCols,
        period_column: parsed.periodCol,
        row_count: parsed.records.length,
        data: parsed.records,
        uploaded_at: new Date().toISOString(),
      };

      const { error: insertErr } = await sb.from("datasets").insert(datasetDoc);
      if (insertErr) {
        console.error("Dataset insert error:", insertErr);
        res
          .status(500)
          .json({ detail: `Database insert failed: ${insertErr.message}` });
        return;
      }

      res.json({
        dataset_id: datasetId,
        filename,
        columns: parsed.columns,
        numeric_columns: parsed.numericCols,
        period_column: parsed.periodCol,
        row_count: parsed.records.length,
      });
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ detail: "Internal server error" });
    }
  },
);

// ─── List datasets ──────────────────────────────────────────────

router.get("/datasets", requireAuth, async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user!;
  const { data } = await sb
    .from("datasets")
    .select(
      "dataset_id, user_id, filename, columns, numeric_columns, period_column, row_count, uploaded_at",
    )
    .eq("user_id", user.user_id)
    .order("uploaded_at", { ascending: false })
    .limit(100);
  res.json(data ?? []);
});

// ─── Get dataset ────────────────────────────────────────────────

router.get(
  "/datasets/:datasetId",
  requireAuth,
  async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user!;
    const { data } = await sb
      .from("datasets")
      .select(
        "dataset_id, user_id, filename, columns, numeric_columns, period_column, row_count, data, uploaded_at",
      )
      .eq("dataset_id", req.params.datasetId)
      .eq("user_id", user.user_id)
      .limit(1);
    if (!data?.length) {
      res.status(404).json({ detail: "Dataset not found" });
      return;
    }
    res.json(data[0]);
  },
);

// ─── Delete dataset ─────────────────────────────────────────────

router.delete(
  "/datasets/:datasetId",
  requireAuth,
  async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user!;
    const dsId = req.params.datasetId;
    const { data } = await sb
      .from("datasets")
      .delete()
      .eq("dataset_id", dsId)
      .eq("user_id", user.user_id)
      .select();
    if (!data?.length) {
      res.status(404).json({ detail: "Dataset not found" });
      return;
    }
    // Clean up related
    await sb.from("metrics").delete().eq("dataset_id", dsId);
    await sb.from("insights").delete().eq("dataset_id", dsId);
    res.json({ ok: true });
  },
);

// ─── Compute metrics ────────────────────────────────────────────

router.post(
  "/metrics/compute/:datasetId",
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

      // Delete previous + insert
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

// ─── Get metrics ────────────────────────────────────────────────

router.get(
  "/metrics/:datasetId",
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

export default router;
