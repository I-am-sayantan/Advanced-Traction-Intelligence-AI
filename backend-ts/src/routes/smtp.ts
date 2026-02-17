import { Router, Request, Response } from "express";
import nodemailer from "nodemailer";
import dns from "dns/promises";
import { sb } from "../supabase";
import { requireAuth } from "../middleware";
import type { AuthenticatedRequest } from "../types";

const router = Router();

// ─── Common SMTP presets ────────────────────────────────────────

const SMTP_PRESETS: Record<
  string,
  { host: string; port: number; secure: boolean; label: string }
> = {
  "gmail.com": {
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    label: "Gmail / Google Workspace",
  },
  "googlemail.com": {
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    label: "Gmail",
  },
  "outlook.com": {
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    label: "Outlook",
  },
  "hotmail.com": {
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    label: "Hotmail",
  },
  "live.com": {
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    label: "Outlook",
  },
  "yahoo.com": {
    host: "smtp.mail.yahoo.com",
    port: 465,
    secure: true,
    label: "Yahoo Mail",
  },
  "zoho.com": {
    host: "smtp.zoho.com",
    port: 587,
    secure: false,
    label: "Zoho Mail",
  },
  "zoho.in": {
    host: "smtp.zoho.in",
    port: 587,
    secure: false,
    label: "Zoho Mail (India)",
  },
  "icloud.com": {
    host: "smtp.mail.me.com",
    port: 587,
    secure: false,
    label: "iCloud Mail",
  },
  "yandex.com": {
    host: "smtp.yandex.com",
    port: 465,
    secure: true,
    label: "Yandex Mail",
  },
  "aol.com": {
    host: "smtp.aol.com",
    port: 587,
    secure: false,
    label: "AOL Mail",
  },
};

// Find preset from email domain
function findPreset(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;

  // Direct match
  if (SMTP_PRESETS[domain]) return { ...SMTP_PRESETS[domain], domain };

  return null;
}

// Detect SMTP host from MX records (for custom domains like admin@dilsaycare.in)
async function detectFromMx(domain: string): Promise<{
  host: string;
  port: number;
  secure: boolean;
  label: string;
} | null> {
  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords.length) return null;

    // Sort by priority (lower = preferred)
    mxRecords.sort((a, b) => a.priority - b.priority);
    const mx = mxRecords[0].exchange.toLowerCase();

    console.log(`MX for ${domain}: ${mx}`);

    // Google Workspace
    if (
      mx.includes("google.com") ||
      mx.includes("googlemail.com") ||
      mx.includes("smtp.google.com") ||
      mx.includes("aspmx.l.google.com")
    ) {
      return {
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        label: "Google Workspace (Gmail)",
      };
    }
    // Microsoft 365 / Outlook
    if (
      mx.includes("outlook.com") ||
      mx.includes("microsoft.com") ||
      mx.includes("office365.com") ||
      mx.includes("protection.outlook.com")
    ) {
      return {
        host: "smtp.office365.com",
        port: 587,
        secure: false,
        label: "Microsoft 365 (Outlook)",
      };
    }
    // Zoho
    if (mx.includes("zoho.com") || mx.includes("zoho.in")) {
      const isIndia = mx.includes("zoho.in");
      return {
        host: isIndia ? "smtp.zoho.in" : "smtp.zoho.com",
        port: 587,
        secure: false,
        label: isIndia ? "Zoho Mail (India)" : "Zoho Mail",
      };
    }
    // Yahoo
    if (mx.includes("yahoo.com") || mx.includes("yahoodns.net")) {
      return {
        host: "smtp.mail.yahoo.com",
        port: 465,
        secure: true,
        label: "Yahoo Mail",
      };
    }
    // Yandex
    if (mx.includes("yandex.")) {
      return {
        host: "smtp.yandex.com",
        port: 465,
        secure: true,
        label: "Yandex Mail",
      };
    }
    // ProtonMail (Bridge needed)
    if (mx.includes("protonmail.ch") || mx.includes("proton.me")) {
      return {
        host: "127.0.0.1",
        port: 1025,
        secure: false,
        label: "ProtonMail (Bridge)",
      };
    }
    // Hostinger
    if (mx.includes("hostinger") || mx.includes("titan.email")) {
      return {
        host: "smtp.hostinger.com",
        port: 465,
        secure: true,
        label: "Hostinger Email",
      };
    }
    // Namecheap / PrivateEmail
    if (mx.includes("privateemail.com") || mx.includes("registrar-servers")) {
      return {
        host: "mail.privateemail.com",
        port: 465,
        secure: true,
        label: "Namecheap Email",
      };
    }
    // GoDaddy
    if (
      mx.includes("secureserver.net") ||
      mx.includes("mailstore1.secureserver.net")
    ) {
      return {
        host: "smtpout.secureserver.net",
        port: 465,
        secure: true,
        label: "GoDaddy Email",
      };
    }
    // Fastmail
    if (mx.includes("fastmail") || mx.includes("messagingengine.com")) {
      return {
        host: "smtp.fastmail.com",
        port: 465,
        secure: true,
        label: "Fastmail",
      };
    }
    // iCloud
    if (mx.includes("icloud.com") || mx.includes("me.com")) {
      return {
        host: "smtp.mail.me.com",
        port: 587,
        secure: false,
        label: "iCloud Mail",
      };
    }
    // Mailgun
    if (mx.includes("mailgun.org")) {
      return {
        host: "smtp.mailgun.org",
        port: 587,
        secure: false,
        label: "Mailgun",
      };
    }

    // Last resort: try to guess SMTP from MX hostname
    // e.g. mx.example.com → smtp.example.com
    const mxParts = mx.split(".");
    if (mxParts.length >= 2) {
      const rootDomain = mxParts.slice(-2).join(".");
      return {
        host: `smtp.${rootDomain}`,
        port: 587,
        secure: false,
        label: `Email via ${rootDomain}`,
      };
    }

    return null;
  } catch (err) {
    console.log(`MX lookup failed for ${domain}:`, err);
    return null;
  }
}

// ─── Detect SMTP settings from email ────────────────────────────

router.post("/detect", requireAuth, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ detail: "email is required" });
      return;
    }

    const domain = email.split("@")[1]?.toLowerCase();
    const preset = findPreset(email);

    if (preset) {
      res.json({
        detected: true,
        provider: preset.label,
        host: preset.host,
        port: preset.port,
        secure: preset.secure,
        instructions: getInstructions(preset.label),
      });
      return;
    }

    // For custom domains: look up MX records to find the actual provider
    const mxResult = await detectFromMx(domain!);

    if (mxResult) {
      res.json({
        detected: true,
        provider: mxResult.label,
        host: mxResult.host,
        port: mxResult.port,
        secure: mxResult.secure,
        instructions: getInstructions(mxResult.label),
      });
    } else {
      res.json({
        detected: false,
        provider: "Unknown Email Provider",
        host: "",
        port: 587,
        secure: false,
        instructions: getInstructions("custom"),
      });
    }
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

// ─── Test SMTP Connection ───────────────────────────────────────

router.post("/test", requireAuth, async (req: Request, res: Response) => {
  try {
    const { email, password, host, port, secure } = req.body;
    if (!email || !password || !host) {
      res
        .status(400)
        .json({ detail: "email, password, and host are required" });
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port: port || 587,
      secure: secure || false,
      auth: {
        user: email,
        pass: password,
      },
      connectionTimeout: 15000,
      socketTimeout: 15000,
      greetingTimeout: 10000,
    });

    // Verify connection
    try {
      await transporter.verify();
    } catch (connErr: any) {
      // If port 587 fails, auto-retry with port 465 (SSL)
      if (
        (port === 587 || !port) &&
        !secure &&
        (connErr.code === "ESOCKET" ||
          connErr.code === "ETIMEDOUT" ||
          connErr.code === "ECONNREFUSED")
      ) {
        console.log(
          `Port 587 failed for ${host}, retrying with port 465 (SSL)...`,
        );
        try {
          transporter.close();
        } catch (_) {}

        const sslTransporter = nodemailer.createTransport({
          host,
          port: 465,
          secure: true,
          auth: { user: email, pass: password },
          connectionTimeout: 15000,
          socketTimeout: 15000,
          greetingTimeout: 10000,
        });

        try {
          await sslTransporter.verify();

          // SSL worked — send test email via SSL
          const user = (req as AuthenticatedRequest).user!;
          await sslTransporter.sendMail({
            from: email,
            to: user.email,
            subject: "✅ Traction AI — Email Setup Successful!",
            html: `
              <div style="font-family: system-ui, sans-serif; padding: 20px; max-width: 500px;">
                <h2 style="color: #4F46E5;">Email Setup Complete! 🎉</h2>
                <p style="color: #374151;">
                  Your email is now connected to Traction AI. You can send investor updates,
                  outreach emails, and more — directly from <strong>${email}</strong>.
                </p>
                <p style="color: #6B7280; font-size: 14px;">
                  This is a test email to confirm everything works.
                </p>
              </div>
            `,
          });
          await sslTransporter.close();

          // Return success with the corrected port info
          res.json({
            success: true,
            message: `Connection successful! Test email sent to ${user.email}`,
            corrected_port: 465,
            corrected_secure: true,
          });
          return;
        } catch (sslErr) {
          try {
            sslTransporter.close();
          } catch (_) {}
          throw connErr; // throw the original error
        }
      }
      throw connErr;
    }

    // Send a test email to self
    const user = (req as AuthenticatedRequest).user!;
    await transporter.sendMail({
      from: email,
      to: user.email,
      subject: "✅ Traction AI — Email Setup Successful!",
      html: `
          <div style="font-family: system-ui, sans-serif; padding: 20px; max-width: 500px;">
            <h2 style="color: #4F46E5;">Email Setup Complete! 🎉</h2>
            <p style="color: #374151;">
              Your email is now connected to Traction AI. You can send investor updates,
              outreach emails, and more — directly from <strong>${email}</strong>.
            </p>
            <p style="color: #6B7280; font-size: 14px;">
              This is a test email to confirm everything is working.
            </p>
          </div>
        `,
    });

    await transporter.close();

    res.json({
      success: true,
      message: `Connection successful! Test email sent to ${user.email}`,
    });
  } catch (err: any) {
    console.error("SMTP test error:", err);

    let userMessage = err.message || "Connection failed";

    // Provide helpful error messages
    if (err.code === "EAUTH" || err.responseCode === 535) {
      userMessage =
        "Wrong password or app password. For Gmail, use an App Password (not your regular password).";
    } else if (err.code === "ESOCKET" || err.code === "ECONNECTION") {
      userMessage =
        "Could not connect to the email server. Check the host and port.";
    } else if (err.code === "ETIMEDOUT") {
      userMessage =
        "Connection timed out. The email server may be blocking the connection.";
    }

    res.status(400).json({
      success: false,
      detail: userMessage,
    });
  }
});

// ─── Save SMTP Settings ────────────────────────────────────────

router.post("/save", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const { email, password, host, port, secure, display_name } = req.body;

    if (!email || !password || !host) {
      res
        .status(400)
        .json({ detail: "email, password, and host are required" });
      return;
    }

    const smtpConfig = {
      email_method: "smtp",
      smtp_host: host,
      smtp_port: port || 587,
      smtp_secure: secure || false,
      smtp_user: email,
      smtp_pass: password, // In production, encrypt this
      sender_email: email,
      sender_name: display_name || "",
      updated_at: new Date().toISOString(),
    };

    // Upsert
    const { data: existing } = await sb
      .from("user_settings")
      .select("user_id")
      .eq("user_id", user.user_id)
      .limit(1);

    if (existing?.length) {
      await sb
        .from("user_settings")
        .update(smtpConfig)
        .eq("user_id", user.user_id);
    } else {
      await sb.from("user_settings").insert({
        user_id: user.user_id,
        ...smtpConfig,
      });
    }

    res.json({ success: true, message: "SMTP settings saved!" });
  } catch (err: any) {
    console.error("Save SMTP error:", err);
    res.status(500).json({ detail: err.message || "Failed to save" });
  }
});

// ─── Get current email method ──────────────────────────────────

router.get("/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const { data } = await sb
      .from("user_settings")
      .select(
        "email_method, smtp_host, smtp_user, sender_email, sender_name, gmail_email",
      )
      .eq("user_id", user.user_id)
      .limit(1);

    const row = data?.[0];
    if (!row) {
      res.json({ method: "none", configured: false });
      return;
    }

    if (row.email_method === "smtp") {
      res.json({
        method: "smtp",
        email: row.smtp_user,
        host: row.smtp_host,
        sender_email: row.sender_email,
        sender_name: row.sender_name || "",
        configured: true,
      });
    } else if (row.email_method === "gmail") {
      res.json({
        method: "gmail",
        email: row.gmail_email || row.sender_email,
        sender_email: row.sender_email,
        sender_name: row.sender_name || "",
        configured: true,
      });
    } else if (row.email_method === "platform") {
      res.json({
        method: "platform",
        email: row.sender_email,
        sender_email: row.sender_email,
        sender_name: row.sender_name || "",
        configured: true,
      });
    } else {
      res.json({
        method: row.sender_email ? "resend" : "none",
        sender_email: row.sender_email || "",
        configured: !!row.sender_email,
      });
    }
  } catch (err: any) {
    res.json({ method: "none", configured: false });
  }
});

// ─── Disconnect SMTP ───────────────────────────────────────────

router.post("/disconnect", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    await sb
      .from("user_settings")
      .update({
        email_method: null,
        smtp_host: null,
        smtp_port: null,
        smtp_secure: null,
        smtp_user: null,
        smtp_pass: null,
        sender_name: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.user_id);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ detail: err.message || "Failed to disconnect" });
  }
});

// ─── Generate App Password Instructions ────────────────────────

function getInstructions(provider: string): {
  title: string;
  steps: string[];
  link?: string;
} {
  switch (provider) {
    case "Gmail / Google Workspace":
    case "Gmail":
    case "Google Workspace (Gmail)":
      return {
        title: "Create a Gmail App Password",
        steps: [
          "Go to your Google Account → Security",
          "Make sure 2-Step Verification is turned ON",
          "Search for 'App passwords' in the Security settings",
          "Select 'Mail' as the app, name it 'Traction AI'",
          "Click 'Generate' — copy the 16-character password",
          "Paste it in the password field above",
        ],
        link: "https://myaccount.google.com/apppasswords",
      };
    case "Outlook":
    case "Hotmail":
    case "Microsoft 365 (Outlook)":
      return {
        title: "Get an Outlook App Password",
        steps: [
          "Go to account.microsoft.com → Security",
          "Click 'Advanced security options'",
          "Under App Passwords, click 'Create a new app password'",
          "Copy the generated password",
          "Paste it in the password field above",
        ],
        link: "https://account.microsoft.com/security",
      };
    case "Zoho Mail":
    case "Zoho Mail (India)":
      return {
        title: "Create a Zoho App Password",
        steps: [
          "Go to Zoho Mail → Settings → Security",
          "Click 'App-Specific Passwords'",
          "Generate a new password for 'Traction AI'",
          "Copy and paste it in the field above",
        ],
        link: "https://accounts.zoho.com/u/h#security/security_pwd",
      };
    case "Yahoo Mail":
      return {
        title: "Create a Yahoo App Password",
        steps: [
          "Go to Yahoo Account Security",
          "Click 'Generate app password'",
          "Select 'Other App' and name it",
          "Copy the generated password",
        ],
        link: "https://login.yahoo.com/account/security",
      };
    case "Hostinger Email":
      return {
        title: "Hostinger Email Password",
        steps: [
          "Use the same password you use to log into Hostinger webmail",
          "Go to Hostinger hPanel → Emails → Manage",
          "If needed, reset your email password from there",
        ],
        link: "https://hpanel.hostinger.com/",
      };
    case "GoDaddy Email":
      return {
        title: "GoDaddy Email Password",
        steps: [
          "Use the password you set when creating your GoDaddy email account",
          "Log into GoDaddy → My Products → Email",
          "If needed, reset your email password from there",
        ],
        link: "https://sso.godaddy.com/",
      };
    case "Namecheap Email":
      return {
        title: "Namecheap Private Email Password",
        steps: [
          "Use the password you set for your Namecheap email",
          "Log into privateemail.com with your credentials to verify",
        ],
        link: "https://privateemail.com/",
      };
    default:
      return {
        title: "SMTP Password",
        steps: [
          "Use your email password or an app-specific password",
          "If your provider requires 2FA, generate an app password first",
          "Check your email provider's documentation for SMTP settings",
        ],
      };
  }
}

// ─── Platform Email Setup (zero-config) ──────────────────────────
// Just saves email + name, sets method to "platform"
// Emails will be sent via Resend from the platform domain with reply-to as user's email

router.post(
  "/platform-setup",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthenticatedRequest).user?.user_id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const { email, senderName } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });

      // Upsert user_settings
      const { data: existing } = await sb
        .from("user_settings")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

      const settingsPayload = {
        user_id: userId,
        sender_email: email,
        sender_name: senderName || email.split("@")[0],
        email_method: "platform",
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await sb
          .from("user_settings")
          .update(settingsPayload)
          .eq("user_id", userId);
      } else {
        await sb.from("user_settings").insert(settingsPayload);
      }

      return res.json({
        success: true,
        message:
          "Platform email configured! Emails will be sent on your behalf with replies going to your inbox.",
        method: "platform",
        email,
        senderName: settingsPayload.sender_name,
      });
    } catch (err: any) {
      console.error("Platform setup error:", err);
      return res.status(500).json({ error: err.message });
    }
  },
);

export default router;
