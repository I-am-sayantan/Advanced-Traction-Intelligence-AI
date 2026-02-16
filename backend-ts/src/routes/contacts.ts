import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import Papa from "papaparse";
import XLSX from "xlsx";
import multer from "multer";
import { sb } from "../supabase";
import { requireAuth } from "../middleware";
import type {
  AuthenticatedRequest,
  ContactCreateBody,
  ContactUpdateBody,
} from "../types";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function shortId(): string {
  return uuidv4().replace(/-/g, "").slice(0, 12);
}

// ─── Create Contact ─────────────────────────────────────────────

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const body = req.body as ContactCreateBody;

    const { data: existing } = await sb
      .from("contacts")
      .select("contact_id")
      .eq("user_id", user.user_id)
      .eq("email", body.email)
      .limit(1);
    if (existing?.length) {
      res
        .status(400)
        .json({ detail: "Contact with this email already exists" });
      return;
    }

    const contactId = `con_${shortId()}`;
    const contactDoc = {
      contact_id: contactId,
      user_id: user.user_id,
      name: body.name,
      email: body.email,
      company: body.company ?? "",
      role: body.role ?? "",
      tags: body.tags ?? [],
      notes: body.notes ?? "",
      emails_sent: 0,
      created_at: new Date().toISOString(),
    };
    const { error: insertErr } = await sb.from("contacts").insert(contactDoc);
    if (insertErr) {
      console.error("Contact insert error:", insertErr);
      res.status(500).json({ detail: `Insert failed: ${insertErr.message}` });
      return;
    }
    res.json(contactDoc);
  } catch (err) {
    console.error("Create contact error:", err);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// ─── List Contacts ──────────────────────────────────────────────

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user!;
  let query = sb.from("contacts").select("*").eq("user_id", user.user_id);
  const tag = req.query.tag as string | undefined;
  if (tag) {
    query = query.contains("tags", [tag]);
  }
  const { data } = await query.order("name").limit(500);
  const rows = (data ?? []).map((r: any) => {
    delete r.id;
    return r;
  });
  res.json(rows);
});

// ─── Update Contact ─────────────────────────────────────────────

router.put("/:contactId", requireAuth, async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user!;
  const body = req.body as ContactUpdateBody;
  const updateFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null) updateFields[k] = v;
  }
  if (!Object.keys(updateFields).length) {
    res.status(400).json({ detail: "No fields to update" });
    return;
  }
  const { data } = await sb
    .from("contacts")
    .update(updateFields)
    .eq("contact_id", req.params.contactId)
    .eq("user_id", user.user_id)
    .select();
  if (!data?.length) {
    res.status(404).json({ detail: "Contact not found" });
    return;
  }
  const row = data[0];
  delete row.id;
  res.json(row);
});

// ─── Delete Contact ─────────────────────────────────────────────

router.delete(
  "/:contactId",
  requireAuth,
  async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user!;
    const { data } = await sb
      .from("contacts")
      .delete()
      .eq("contact_id", req.params.contactId)
      .eq("user_id", user.user_id)
      .select();
    if (!data?.length) {
      res.status(404).json({ detail: "Contact not found" });
      return;
    }
    res.json({ ok: true });
  },
);

// ─── Import Contacts (CSV / Excel) ─────────────────────────────

router.post(
  "/import",
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
      const filename = file.originalname || "contacts.csv";

      let records: Record<string, unknown>[];
      if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
        const wb = XLSX.read(file.buffer, { type: "buffer" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      } else {
        const csv = file.buffer.toString("utf-8");
        const parsed = Papa.parse<Record<string, unknown>>(csv, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
        });
        records = parsed.data;
      }

      // Normalize column names
      if (!records.length) {
        res.status(400).json({ detail: "File is empty" });
        return;
      }
      const rawCols = Object.keys(records[0]);
      const colMap: Record<string, string> = {};
      for (const c of rawCols)
        colMap[c] = c.trim().toLowerCase().replace(/ /g, "_");
      records = records.map((r) => {
        const out: Record<string, unknown> = {};
        for (const [orig, norm] of Object.entries(colMap)) out[norm] = r[orig];
        return out;
      });

      const columns = Object.values(colMap);
      if (!columns.includes("email")) {
        res.status(400).json({ detail: "CSV must have an 'email' column" });
        return;
      }

      let imported = 0;
      let skipped = 0;
      for (const row of records) {
        const email = String(row.email ?? "").trim();
        if (!email || !email.includes("@")) {
          skipped++;
          continue;
        }
        const { data: existing } = await sb
          .from("contacts")
          .select("contact_id")
          .eq("user_id", user.user_id)
          .eq("email", email)
          .limit(1);
        if (existing?.length) {
          skipped++;
          continue;
        }
        const tagsRaw = String(row.tags ?? row.tag ?? "");
        const tags = tagsRaw
          ? tagsRaw
              .split(",")
              .map((t: string) => t.trim())
              .filter(Boolean)
          : [];
        await sb.from("contacts").insert({
          contact_id: `con_${shortId()}`,
          user_id: user.user_id,
          name: String(row.name ?? row.first_name ?? "").trim(),
          email,
          company: String(row.company ?? row.organization ?? "").trim(),
          role: String(row.role ?? row.title ?? row.position ?? "").trim(),
          tags,
          notes: String(row.notes ?? "").trim(),
          emails_sent: 0,
          last_contacted: null,
          created_at: new Date().toISOString(),
        });
        imported++;
      }

      res.json({ imported, skipped, total_rows: records.length });
    } catch (err) {
      console.error("Import contacts error:", err);
      res.status(500).json({ detail: "Internal server error" });
    }
  },
);

// ─── Tags ───────────────────────────────────────────────────────

router.get("/tags", requireAuth, async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user!;
  const { data } = await sb
    .from("contacts")
    .select("tags")
    .eq("user_id", user.user_id);
  const tagCounts: Record<string, number> = {};
  for (const row of data ?? []) {
    for (const tag of row.tags ?? []) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }
  const sorted = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50);
  res.json(sorted.map(([tag, count]) => ({ tag, count })));
});

export default router;
