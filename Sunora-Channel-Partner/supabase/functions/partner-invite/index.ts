import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://sunora-channel-partner.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]!);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!supabaseUrl || !serviceKey || !resendKey) {
    return response({ error: "Server configuration is incomplete." }, 500);
  }

  let createdUserId: string | null = null;
  let partnerId: string | null = null;
  let partnerLinked = false;
  let stage = "admin_authentication";

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return response({ error: "Admin login required." }, 401);

    const token = authorization.substring(7);
    const { data: authData, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !authData.user) return response({ error: "Invalid login session." }, 401);

    const { data: callerProfile, error: callerError } = await adminClient
      .from("profiles").select("role").eq("id", authData.user.id).single();
    if (callerError || callerProfile?.role !== "admin") return response({ error: "Admin access only." }, 403);

    stage = "partner_validation";
    const body = await req.json();
    partnerId = body.partner_id;
    if (
      typeof partnerId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(partnerId)
    ) return response({ error: "A valid partner ID is required." }, 400);

    const { data: partner, error: partnerError } = await adminClient
      .from("partners").select("id, full_name, email, user_id, status").eq("id", partnerId).single();
    if (partnerError || !partner) return response({ error: "Partner record not found." }, 404);
    if (!partner.email?.trim()) return response({ error: "Partner email is required for login." }, 400);
    if (partner.user_id) return response({ error: "This partner already has a login." }, 409);
    if (partner.status !== "active") return response({ error: "Only active partners can be invited." }, 400);

    const email = partner.email.trim().toLowerCase();

    stage = "create_login";
    const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: partner.full_name, account_type: "partner" },
    });
    if (createError || !userData.user) {
      throw new Error("Could not create partner login. The email may already be registered.");
    }
    createdUserId = userData.user.id;

    stage = "generate_password_link";
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: "https://sunora-channel-partner.vercel.app" },
    });
    if (linkError || !linkData.properties?.action_link) {
      throw new Error("Could not create password setup link.");
    }

    // The auth.users insert fires handle_new_user(), which creates the profiles row.
    // Do not insert the same profile again; verify the trigger-created row instead.
    stage = "verify_auth_profile";
    const { data: profileData, error: profileError } = await adminClient
      .from("profiles").select("id, role, full_name").eq("id", createdUserId).maybeSingle();
    if (profileError || !profileData) throw new Error("Partner profile setup failed.");
    if (profileData.role !== "partner") throw new Error("New login is not assigned the partner role.");

    stage = "link_partner";
    const { data: linked, error: updateError } = await adminClient
      .from("partners")
      .update({ user_id: createdUserId })
      .eq("id", partnerId)
      .is("user_id", null)
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!linked) throw new Error("Could not link the new login to the partner.");
    partnerLinked = true;

    stage = "send_invitation_email";
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Sunora Partner Portal <partners@sunora.ae>",
        to: [email],
        subject: "Your Sunora Partner Portal invitation",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#333">
            <h2>Welcome to Sunora</h2>
            <p>Hello ${escapeHtml(partner.full_name)},</p>
            <p>Your Sunora Partner Portal account has been created.</p>
            <p>Click below to set your password and access your account.</p>
            <p><a href="${linkData.properties.action_link}" style="display:inline-block;padding:13px 24px;background:#8b6b35;color:white;text-decoration:none;border-radius:6px">Set Your Password</a></p>
            <p>If you did not expect this invitation, please ignore this email.</p>
            <p>Sunora Partner Team</p>
          </div>
        `,
      }),
    });
    if (!emailResponse.ok) throw new Error("Invitation email could not be delivered.");

    return response({ success: true, message: "Partner login created and invitation email sent.", partner_id: partnerId });
  } catch (error) {
    console.error("partner-invite failure", {
      stage,
      error_type: error instanceof Error ? error.name : "UnknownError",
    });

    if (partnerLinked && partnerId) {
      await adminClient.from("partners").update({ user_id: null }).eq("id", partnerId);
    }
    if (createdUserId) {
      // Deleting the auth user also cascades its trigger-created profiles row.
      await adminClient.auth.admin.deleteUser(createdUserId);
    }

    const message = error instanceof Error ? error.message : "Partner invitation failed.";
    return response({ success: false, error: message, stage }, 500);
  }
});
