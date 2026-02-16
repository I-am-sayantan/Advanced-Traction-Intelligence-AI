import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { Resend } from "resend";
import { sb } from "../supabase";
import { config } from "../config";
import { requireAuth } from "../middleware";
import type {
  AuthenticatedRequest,
  EmailSendBody,
  EmailResult,
} from "../types";

const router = Router();

function shortId(): string {
  return uuidv4().replace(/-/g, "").slice(0, 12);
}

// ─── Send Email ─────────────────────────────────────────────────

router.post("/send", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!config.resendApiKey) {
      res.status(500).json({ detail: "Email service not configured" });
      return;
    }
    const resend = new Resend(config.resendApiKey);
    const user = (req as AuthenticatedRequest).user!;
    const body = req.body as EmailSendBody;

    // Resolve contacts
    const contacts: any[] = [];
    for (const cid of body.contact_ids) {
      const { data } = await sb
        .from("contacts")
        .select("*")
        .eq("contact_id", cid)
        .eq("user_id", user.user_id)
        .limit(1);
      if (data?.length) contacts.push(data[0]);
    }
    if (!contacts.length) {
      res.status(400).json({ detail: "No valid contacts found" });
      return;
    }

    const results: EmailResult[] = [];
    for (const contact of contacts) {
      try {
        const emailResult = await resend.emails.send({
          from: config.senderEmail,
          to: [contact.email],
          subject: body.subject,
          html: body.html_content,
          replyTo: user.email,
        });
        const emailId =
          (emailResult as any)?.data?.id ?? (emailResult as any)?.id;

        const currentSent = contact.emails_sent ?? 0;
        await sb
          .from("contacts")
          .update({
            last_contacted: new Date().toISOString(),
            emails_sent: currentSent + 1,
          })
          .eq("contact_id", contact.contact_id);

        results.push({
          contact_id: contact.contact_id,
          email: contact.email,
          status: "sent",
          email_id: emailId,
        });
      } catch (e: any) {
        results.push({
          contact_id: contact.contact_id,
          email: contact.email,
          status: "failed",
          error: String(e),
        });
      }
    }

    const logId = `elog_${shortId()}`;
    await sb.from("email_logs").insert({
      log_id: logId,
      user_id: user.user_id,
      subject: body.subject,
      recipients: results,
      narrative_id: body.narrative_id ?? null,
      sent_at: new Date().toISOString(),
    });

    const sentCount = results.filter((r) => r.status === "sent").length;
    res.json({
      log_id: logId,
      sent: sentCount,
      failed: results.length - sentCount,
      results,
    });
  } catch (err) {
    console.error("Email send error:", err);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// ─── Email Logs ─────────────────────────────────────────────────

router.get("/logs", requireAuth, async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user!;
  const { data } = await sb
    .from("email_logs")
    .select("*")
    .eq("user_id", user.user_id)
    .order("sent_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []).map((r: any) => {
    delete r.id;
    return r;
  });
  res.json(rows);
});

export default router;
