import { Router, Request, Response } from "express";
import { google } from "googleapis";
import { sb } from "../supabase";
import { config } from "../config";
import { requireAuth } from "../middleware";
import type { AuthenticatedRequest } from "../types";

const router = Router();

// ─── OAuth2 client for Gmail ────────────────────────────────────

function getOAuth2Client() {
  return new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri,
  );
}

// ─── Step 1: Generate the Google OAuth URL ──────────────────────
// Frontend calls this, then opens the URL in a popup

router.get("/auth-url", requireAuth, (_req: Request, res: Response) => {
  if (!config.googleClientSecret) {
    res.status(500).json({
      detail:
        "Google Client Secret not configured. Add GOOGLE_CLIENT_SECRET to .env",
    });
    return;
  }

  const oAuth2Client = getOAuth2Client();
  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
  });

  res.json({ url });
});

// ─── Step 2: Exchange the auth code for tokens ──────────────────
// Called after user authorizes in the popup

router.post("/callback", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ detail: "Authorization code is required" });
      return;
    }

    const oAuth2Client = getOAuth2Client();
    const { tokens } = await oAuth2Client.getToken(code);

    if (!tokens.access_token) {
      res.status(400).json({ detail: "Failed to get access token" });
      return;
    }

    // Get user info from Google
    oAuth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oAuth2Client });
    const { data: profile } = await oauth2.userinfo.get();

    const gmailEmail = profile.email || user.email;
    const gmailName = profile.name || "";

    // Save tokens + settings to user_settings
    const gmailConfig = {
      email_method: "gmail",
      gmail_access_token: tokens.access_token,
      gmail_refresh_token: tokens.refresh_token || null,
      gmail_token_expiry: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      gmail_email: gmailEmail,
      sender_email: gmailEmail,
      sender_name: gmailName,
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
        .update(gmailConfig)
        .eq("user_id", user.user_id);
    } else {
      await sb
        .from("user_settings")
        .insert({ user_id: user.user_id, ...gmailConfig });
    }

    res.json({
      success: true,
      email: gmailEmail,
      name: gmailName,
      message: `Connected! Emails will be sent from ${gmailEmail}`,
    });
  } catch (err: any) {
    console.error("Gmail OAuth callback error:", err);
    res.status(400).json({
      detail: err.message || "Failed to connect Google account",
    });
  }
});

// ─── Status: Check if Gmail is connected ────────────────────────

router.get("/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const { data } = await sb
      .from("user_settings")
      .select("email_method, gmail_email, sender_name, gmail_token_expiry")
      .eq("user_id", user.user_id)
      .limit(1);

    if (data?.[0]?.email_method === "gmail" && data[0].gmail_email) {
      res.json({
        connected: true,
        email: data[0].gmail_email,
        name: data[0].sender_name || "",
        method: "gmail",
      });
    } else {
      res.json({ connected: false });
    }
  } catch {
    res.json({ connected: false });
  }
});

// ─── Disconnect Gmail ───────────────────────────────────────────

router.post("/disconnect", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    await sb
      .from("user_settings")
      .update({
        email_method: null,
        gmail_access_token: null,
        gmail_refresh_token: null,
        gmail_token_expiry: null,
        gmail_email: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.user_id);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

// ─── Send email via Gmail API ───────────────────────────────────
// Used by email.ts when email_method === "gmail"

export async function sendViaGmail(
  userId: string,
  to: string,
  subject: string,
  htmlContent: string,
  replyTo?: string,
): Promise<{ messageId: string }> {
  // Fetch stored tokens
  const { data } = await sb
    .from("user_settings")
    .select(
      "gmail_access_token, gmail_refresh_token, gmail_token_expiry, gmail_email, sender_name",
    )
    .eq("user_id", userId)
    .limit(1);

  if (!data?.[0]?.gmail_access_token) {
    throw new Error(
      "Gmail not connected. Please reconnect your Google account.",
    );
  }

  const settings = data[0];
  const oAuth2Client = getOAuth2Client();

  oAuth2Client.setCredentials({
    access_token: settings.gmail_access_token,
    refresh_token: settings.gmail_refresh_token,
    expiry_date: settings.gmail_token_expiry
      ? new Date(settings.gmail_token_expiry).getTime()
      : undefined,
  });

  // Auto-refresh if expired
  try {
    const tokenResponse = await oAuth2Client.getAccessToken();
    const newToken = tokenResponse?.token;
    if (newToken && newToken !== settings.gmail_access_token) {
      // Token was refreshed, save new one
      const creds = oAuth2Client.credentials;
      await sb
        .from("user_settings")
        .update({
          gmail_access_token: newToken,
          gmail_token_expiry: creds.expiry_date
            ? new Date(creds.expiry_date).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    }
  } catch (refreshErr: any) {
    console.error("Token refresh failed:", refreshErr);
    // Clear tokens so user knows to reconnect
    await sb
      .from("user_settings")
      .update({
        email_method: null,
        gmail_access_token: null,
        gmail_refresh_token: null,
        gmail_token_expiry: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    throw new Error(
      "Gmail access expired. Please reconnect your Google account.",
    );
  }

  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  // Build the RFC 2822 email
  const fromHeader = settings.sender_name
    ? `${settings.sender_name} <${settings.gmail_email}>`
    : settings.gmail_email;

  const messageParts = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    "",
    htmlContent,
  ];

  const rawMessage = messageParts.join("\r\n");
  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
    },
  });

  return { messageId: result.data.id || "sent" };
}

// ─── Send test email ────────────────────────────────────────────

router.post("/send-test", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user!;

    const result = await sendViaGmail(
      user.user_id,
      user.email,
      "✅ Traction AI — Gmail Connected!",
      `
        <div style="font-family: system-ui, sans-serif; padding: 20px; max-width: 500px;">
          <h2 style="color: #4F46E5;">Gmail Connected! 🎉</h2>
          <p style="color: #374151;">
            Your Gmail is now connected to Traction AI. You can send investor updates,
            outreach emails, and more — directly from your Gmail account.
          </p>
          <p style="color: #6B7280; font-size: 14px;">
            No passwords stored. Secure OAuth connection.
          </p>
        </div>
      `,
    );

    res.json({
      success: true,
      message: `Test email sent to ${user.email}!`,
      messageId: result.messageId,
    });
  } catch (err: any) {
    console.error("Gmail test send error:", err);
    res.status(400).json({
      detail: err.message || "Failed to send test email",
    });
  }
});

export default router;
