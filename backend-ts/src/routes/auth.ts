import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { OAuth2Client } from "google-auth-library";
import { sb } from "../supabase";
import { config } from "../config";
import { requireAuth } from "../middleware";
import type { AuthenticatedRequest } from "../types";

const router = Router();
const googleClient = new OAuth2Client(config.googleClientId);

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
    if (existing && existing.length > 0) {
      userId = existing[0].user_id;
      await sb.from("users").update({ name, picture }).eq("email", email);
    } else {
      userId = `user_${uuidv4().replace(/-/g, "").slice(0, 12)}`;
      await sb.from("users").insert({
        user_id: userId,
        email,
        name,
        picture,
        created_at: new Date().toISOString(),
      });
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
