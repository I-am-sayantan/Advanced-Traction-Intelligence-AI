import { Request, Response, NextFunction } from "express";
import { sb } from "./supabase";
import type { AuthenticatedRequest, User } from "./types";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let sessionToken = req.cookies?.session_token as string | undefined;
  if (!sessionToken) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      sessionToken = authHeader.slice(7);
    }
  }
  if (!sessionToken) {
    res.status(401).json({ detail: "Not authenticated" });
    return;
  }

  const { data: sessions } = await sb
    .from("user_sessions")
    .select("*")
    .eq("session_token", sessionToken)
    .limit(1);

  if (!sessions || sessions.length === 0) {
    res.status(401).json({ detail: "Invalid session" });
    return;
  }

  const session = sessions[0];
  let expiresAt = session.expires_at;
  if (typeof expiresAt === "string") {
    expiresAt = new Date(expiresAt.replace("Z", "+00:00"));
  }
  if (new Date(expiresAt) < new Date()) {
    res.status(401).json({ detail: "Session expired" });
    return;
  }

  const { data: users } = await sb
    .from("users")
    .select("user_id, email, name, picture, created_at")
    .eq("user_id", session.user_id)
    .limit(1);

  if (!users || users.length === 0) {
    res.status(401).json({ detail: "User not found" });
    return;
  }

  (req as AuthenticatedRequest).user = users[0] as User;
  next();
}
