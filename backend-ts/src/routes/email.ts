import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { sb } from "../supabase";
import { config } from "../config";
import { requireAuth } from "../middleware";
import { sendViaGmail } from "./gmail";
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
    const user = (req as AuthenticatedRequest).user!;
    const body = req.body as EmailSendBody;

    // Get user settings to determine sending method
    let settings: any = null;
    try {
      const { data } = await sb
        .from("user_settings")
        .select("*")
        .eq("user_id", user.user_id)
        .limit(1);
      settings = data?.[0];
    } catch (_) {
      /* use defaults */
    }

    const emailMethod = settings?.email_method || "resend";
    const senderEmail = settings?.sender_email || config.senderEmail;
    const senderName = settings?.sender_name || "";

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

    // ─── Gmail API Sending ───────────────────────
    if (emailMethod === "gmail") {
      for (const contact of contacts) {
        try {
          const result = await sendViaGmail(
            user.user_id,
            contact.email,
            body.subject,
            body.html_content,
            user.email,
          );

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
            email_id: result.messageId,
          });
        } catch (e: any) {
          results.push({
            contact_id: contact.contact_id,
            email: contact.email,
            status: "failed",
            error: String(e.message || e),
          });
        }
      }
    }
    // ─── SMTP Sending ────────────────────────────
    else if (
      emailMethod === "smtp" &&
      settings?.smtp_host &&
      settings?.smtp_pass
    ) {
      const transporter = nodemailer.createTransport({
        host: settings.smtp_host,
        port: settings.smtp_port || 587,
        secure: settings.smtp_secure || false,
        auth: {
          user: settings.smtp_user || senderEmail,
          pass: settings.smtp_pass,
        },
      });

      const fromAddress = senderName
        ? `${senderName} <${senderEmail}>`
        : senderEmail;

      for (const contact of contacts) {
        try {
          const info = await transporter.sendMail({
            from: fromAddress,
            to: contact.email,
            subject: body.subject,
            html: body.html_content,
            replyTo: user.email,
          });

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
            email_id: info.messageId,
          });
        } catch (e: any) {
          results.push({
            contact_id: contact.contact_id,
            email: contact.email,
            status: "failed",
            error: String(e.message || e),
          });
        }
      }

      await transporter.close();
    }
    // ─── Resend Sending (default / platform mode) ─
    else {
      if (!config.resendApiKey) {
        res.status(500).json({ detail: "Email service not configured" });
        return;
      }
      const resend = new Resend(config.resendApiKey);

      // Check if user has a verified domain — if so, send from their domain
      const domainVerified = settings?.resend_domain_status === "verified";
      const domainName = settings?.resend_domain_name;
      let fromAddress: string;

      if (domainVerified && domainName) {
        // Send from verified domain — emails reach anyone!
        const displayNamePart = senderName || user.email.split("@")[0];
        fromAddress = `${displayNamePart} <noreply@${domainName}>`;
      } else if (emailMethod === "platform" && senderName) {
        // Fallback: platform mode with test sender (limited delivery)
        fromAddress = `${senderName} via Traction AI <${config.senderEmail}>`;
      } else {
        fromAddress = senderEmail;
      }

      const replyToAddr =
        emailMethod === "platform"
          ? settings?.sender_email || user.email
          : user.email;

      for (const contact of contacts) {
        try {
          const emailResult = await resend.emails.send({
            from: fromAddress,
            to: [contact.email],
            subject: body.subject,
            html: body.html_content,
            replyTo: replyToAddr,
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
