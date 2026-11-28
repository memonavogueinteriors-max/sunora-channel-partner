import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { welcomeEmailHtml } from "./welcome-email.ts";

const allowedOrigin = (origin: string | null) => {
  if (!origin) return "";
  if (origin === "https://sunora-channel-partner.vercel.app") return origin;
  // Allow only SUNORA Channel Partner's Vercel deployment/preview hosts, not arbitrary sites.
  if (/^https:\/\/sunora-channel-partner-[a-z0-9-]+\.vercel\.app$/i.test(origin)) return origin;
  return "";
};
const headersFor = (origin: string | null) => ({
  "Access-Control-Allow-Origin": allowedOrigin(origin),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
  "Content-Type": "application/json"
});
const response = (body: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), { status, headers: headersFor(origin) });

Deno.serve(async req => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: headersFor(origin) });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405, origin);
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return response({ error: "Authentication required." }, 401, origin);
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), resend = Deno.env.get("RESEND_API_KEY");
    if (!url || !key || !resend) return response({ error: "Email service configuration is missing." }, 503, origin);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const { data: user, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !user.user) return response({ error: "Authentication failed." }, 401, origin);
    const { data: profile, error: profileErr } = await admin.from("profiles").select("role").eq("id", user.user.id).maybeSingle();
    if (profileErr || profile?.role !== "admin") return response({ error: "Admin access only." }, 403, origin);
    const recipient = user.user.email;
    if (!recipient) return response({ error: "Your account has no email address." }, 400, origin);
    const html = welcomeEmailHtml({ name: "Sample Channel Partner", partnerCode: "CH-DEMO-000", joinDate: "27 Nov 2026", actionUrl: "https://sunora-channel-partner.vercel.app", test: true });
    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + resend, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "SUNORA Channel Partner Program <info@sunora.ae>", to: [recipient], subject: "SUNORA Welcome Email — Design Test", html })
    });
    if (!send.ok) return response({ error: "Resend could not deliver the test email. Please check provider configuration." }, 502, origin);
    return response({ success: true, message: "Test email sent to your signed-in admin email address.", recipient }, 200, origin);
  } catch {
    return response({ error: "Test email failed. Please retry or contact support." }, 500, origin);
  }
});
