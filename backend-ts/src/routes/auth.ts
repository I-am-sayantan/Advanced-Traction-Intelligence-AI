import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { OAuth2Client } from "google-auth-library";
import { Resend } from "resend";
import { sb } from "../supabase";
import { config } from "../config";
import { requireAuth } from "../middleware";
import type { AuthenticatedRequest } from "../types";

const router = Router();
const googleClient = new OAuth2Client(config.googleClientId);

// Free email providers that can't add DNS records
const FREE_EMAIL_PROVIDERS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "zoho.com",
  "zohomail.in",
  "yandex.com",
  "mail.com",
  "gmx.com",
  "fastmail.com",
]);

// Auto-register user's domain with Resend (non-blocking)
async function autoRegisterDomain(
  userId: string,
  email: string,
): Promise<void> {
  try {
    if (!config.resendApiKey) return;
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain || FREE_EMAIL_PROVIDERS.has(domain)) return;

    const resend = new Resend(config.resendApiKey);

    // Check if domain already exists in Resend
    let domainData: any = null;
    try {
      const listResult = await resend.domains.list();
      const allDomains =
        (listResult as any)?.data?.data ?? (listResult as any)?.data ?? [];
      const existing = allDomains.find((d: any) => d.name === domain);
      if (existing) {
        const detailResult = await resend.domains.get(existing.id);
        domainData = (detailResult as any)?.data ?? detailResult;
      }
    } catch (e) {
      console.log("Could not list domains during auto-register:", e);
    }

    if (!domainData) {
      // Create new domain
      const createResult = await resend.domains.create({ name: domain });
      const created = (createResult as any)?.data ?? createResult;
      if (!created?.id) return;
      try {
        const detailResult = await resend.domains.get(created.id);
        domainData = (detailResult as any)?.data ?? detailResult;
      } catch {
        domainData = created;
      }
    }

    if (domainData?.id) {
      const status = domainData.status === "verified" ? "verified" : "pending";
      await sb
        .from("user_settings")
        .update({
          resend_domain_id: domainData.id,
          resend_domain_name: domain,
          resend_domain_status: status,
        })
        .eq("user_id", userId);
      console.log(`Auto-registered domain ${domain} (${status}) for ${email}`);
    }
  } catch (err) {
    console.warn("Auto domain registration skipped:", err);
  }
}

// Helper: create session + set cookie
async function createSession(res: Response, userId: string): Promise<string> {
  const sessionToken = uuidv4().replace(/-/g, "");
  await sb.from("user_sessions").insert({
    user_id: userId,
    session_token: sessionToken,
    expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    created_at: new Date().toISOString(),
  });
  res.cookie("session_token", sessionToken, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 3600 * 1000,
  });
  return sessionToken;
}

// ─── Google OAuth ───────────────────────────────────────────────

router.post("/google", async (req: Request, res: Response) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      res.status(400).json({ detail: "Google credential is required" });
      return;
    }

    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: config.googleClientId,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      res.status(401).json({ detail: "Invalid Google token" });
      return;
    }

    const email = payload.email;
    const name = payload.name || "";
    const picture = payload.picture || "";

    // Upsert user
    const { data: existing } = await sb
      .from("users")
      .select("*")
      .eq("email", email)
      .limit(1);

    let userId: string;
    let isNewUser = false;
    if (existing && existing.length > 0) {
      userId = existing[0].user_id;
      await sb.from("users").update({ name, picture }).eq("email", email);
    } else {
      isNewUser = true;
      userId = `user_${uuidv4().replace(/-/g, "").slice(0, 12)}`;
      await sb.from("users").insert({
        user_id: userId,
        email,
        name,
        picture,
        created_at: new Date().toISOString(),
      });
    }

    // Auto-configure platform email for new users so email works immediately
    if (isNewUser) {
      try {
        await sb.from("user_settings").insert({
          user_id: userId,
          sender_email: email,
          sender_name: name || email.split("@")[0],
          email_method: "platform",
          updated_at: new Date().toISOString(),
        });
        console.log(`Auto-configured platform email for new user ${email}`);
        // Auto-register domain with Resend (non-blocking)
        autoRegisterDomain(userId, email).catch(() => {});
      } catch (emailSetupErr) {
        // Non-critical — user can set up later manually
        console.warn("Auto email setup skipped:", emailSetupErr);
      }
    } else {
      // For existing users: ensure they have email settings (backfill)
      try {
        const { data: existingSettings } = await sb
          .from("user_settings")
          .select("user_id, resend_domain_id")
          .eq("user_id", userId)
          .limit(1);
        if (!existingSettings?.length) {
          await sb.from("user_settings").insert({
            user_id: userId,
            sender_email: email,
            sender_name: name || email.split("@")[0],
            email_method: "platform",
            updated_at: new Date().toISOString(),
          });
          console.log(`Backfilled platform email for existing user ${email}`);
          // Auto-register domain with Resend (non-blocking)
          autoRegisterDomain(userId, email).catch(() => {});
        } else if (!existingSettings[0].resend_domain_id) {
          // Existing user but no domain registered yet
          autoRegisterDomain(userId, email).catch(() => {});
        }
      } catch (_) {
        /* non-critical */
      }
    }

    await createSession(res, userId);

    const { data: userRow } = await sb
      .from("users")
      .select("user_id, email, name, picture, created_at")
      .eq("user_id", userId)
      .limit(1);

    res.json(userRow?.[0] ?? {});
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(401).json({ detail: "Google authentication failed" });
  }
});

// ─── Dev Login ──────────────────────────────────────────────────

router.post("/dev-login", async (_req: Request, res: Response) => {
  try {
    const email = "dev@localhost.com";
    const name = "Dev User";
    const userId = "user_dev_local";

    const { data: existing } = await sb
      .from("users")
      .select("*")
      .eq("email", email)
      .limit(1);

    if (!existing || existing.length === 0) {
      await sb.from("users").insert({
        user_id: userId,
        email,
        name,
        picture: "",
        created_at: new Date().toISOString(),
      });
    }

    await createSession(res, userId);

    res.json({ user_id: userId, email, name, picture: "" });
  } catch (err) {
    console.error("Dev login error:", err);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// ─── Me ─────────────────────────────────────────────────────────

router.get("/me", requireAuth, (req: Request, res: Response) => {
  res.json((req as AuthenticatedRequest).user);
});

// ─── Logout ─────────────────────────────────────────────────────

router.post("/logout", async (req: Request, res: Response) => {
  const sessionToken = req.cookies?.session_token;
  if (sessionToken) {
    await sb.from("user_sessions").delete().eq("session_token", sessionToken);
  }
  res.clearCookie("session_token", { path: "/" });
  res.json({ ok: true });
});

export default router;
