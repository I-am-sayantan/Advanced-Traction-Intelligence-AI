import dotenv from "dotenv";
dotenv.config();

export const config = {
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseKey: process.env.SUPABASE_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  resendApiKey: process.env.RESEND_API_KEY || "",
  senderEmail: process.env.SENDER_EMAIL || "onboarding@resend.dev",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:3000/auth/google/callback",
  port: parseInt(process.env.PORT || "8000", 10),
};
