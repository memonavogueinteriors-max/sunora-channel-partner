import { createClient } from "npm:@supabase/supabase-js@2";
import { SALES_SHEET_HEADERS, mapSalesToSheetRows, planSalesSheetSync } from "../_shared/sheetsSync.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://sunora-channel-partner.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function utf8Base64Url(value: string) {
  return base64Url(new TextEncoder().encode(value));
}
function quoteSheet(tab: string) {
  return "'" + tab.replace(/'/g, "''") + "'";
}
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
async function googleAccessToken(rawCredentials: string) {
  const credentials = JSON.parse(rawCredentials);
  if (!credentials.client_email || !credentials.private_key || credentials.token_uri !== "https://oauth2.googleapis.com/token") {
    throw new Error("Google service-account credentials are incomplete or use an unsupported token endpoint.");
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = utf8Base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = utf8Base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const unsigned = header + "." + claim;
  const pem = credentials.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const keyBytes = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", keyBytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const assertion = unsigned + "." + base64Url(signature);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!tokenResponse.ok) throw new Error("Google OAuth token request failed.");
  const tokenBody = await tokenResponse.json();
  if (!tokenBody.access_token) throw new Error("Google OAuth response did not include an access token.");
  return tokenBody.access_token as string;
}
async function googleRequest(url: string, token: string, method = "GET", body?: unknown, retryable = true) {
  for (let attempt = 0; attempt < (retryable ? 3 : 1); attempt++) {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.ok) return response.status === 204 ? {} : await response.json();
      const error = new Error("Google Sheets API returned HTTP " + response.status + ".") as Error & { status: number };
      error.status = response.status;
      if (retryable && (response.status === 429 || response.status >= 500) && attempt < 2) {
        await delay(250 * (attempt + 1));
        continue;
      }
      throw error;
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      if (retryable && (!status || status === 429 || status >= 500) && attempt < 2) {
        await delay(250 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Google Sheets API retry limit reached.");
}
async function readSheetValues(spreadsheetId: string, tab: string, token: string) {
  const range = encodeURIComponent(quoteSheet(tab) + "!A:L");
  const url = "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(spreadsheetId) + "/values/" + range + "?majorDimension=ROWS";
  const result = await googleRequest(url, token);
  return Array.isArray(result.values) ? result.values as string[][] : [];
}
async function writeHeader(spreadsheetId: string, tab: string, token: string) {
  const range = encodeURIComponent(quoteSheet(tab) + "!A1:L1");
  const url = "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(spreadsheetId) + "/values/" + range + "?valueInputOption=RAW";
  await googleRequest(url, token, "PUT", { values: [SALES_SHEET_HEADERS] });
}
async function applyPlan(spreadsheetId: string, tab: string, token: string, plan: ReturnType<typeof planSalesSheetSync>) {
  if (plan.updateRows.length) {
    const data = plan.updateRows.map(row => ({
      range: quoteSheet(tab) + "!A" + row.rowNumber + ":L" + row.rowNumber,
      values: [row.values],
    }));
    await googleRequest("https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(spreadsheetId) + "/values:batchUpdate", token, "POST", {
      valueInputOption: "RAW",
      data,
    });
  }
  if (plan.appendRows.length) {
    const range = encodeURIComponent(quoteSheet(tab) + "!A:L");
    const url = "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(spreadsheetId) + "/values/" + range + ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS";
    // Append is deliberately not retried blindly. The outer loop re-reads stable IDs
    // after an ambiguous timeout before deciding what is still missing.
    await googleRequest(url, token, "POST", { values: plan.appendRows }, false);
  }
}
function verifyRows(values: string[][], incoming: string[][]) {
  const rowsById = new Map<string, string[][]>();
  for (const row of values.slice(1)) {
    const id = String(row?.[0] ?? "");
    if (!id) continue;
    rowsById.set(id, [...(rowsById.get(id) || []), row]);
  }
  for (const expected of incoming) {
    const matches = rowsById.get(String(expected[0])) || [];
    if (matches.length !== 1) return false;
    if (SALES_SHEET_HEADERS.some((_, column) => String(matches[0]?.[column] ?? "") !== String(expected[column] ?? ""))) return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return respond({ error: "Server configuration is incomplete." }, 500);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return respond({ error: "Admin or Staff login required." }, 401);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const { data: authData, error: authError } = await admin.auth.getUser(authorization.substring(7));
    if (authError || !authData.user) return respond({ error: "Invalid login session." }, 401);
    const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", authData.user.id).single();
    if (profileError || !["admin", "staff"].includes(profile?.role)) return respond({ error: "Admin or Staff access only." }, 403);

    let body: { dry_run?: boolean } = {};
    try { body = await req.json(); } catch { return respond({ error: "Request body must be JSON." }, 400); }
    if (body.dry_run !== undefined && typeof body.dry_run !== "boolean") return respond({ error: "dry_run must be true or false." }, 400);
    const dryRun = body.dry_run !== false;

    const { data: sales, error: salesError } = await admin.from("sales")
      .select("id,partner_id,invoice_number,invoice_date,product_description,panel_quantity,quantity,invoice_currency,subtotal_ex_vat,vat_amount,total_inc_vat,invoice_amount")
      .order("invoice_date", { ascending: true });
    if (salesError) return respond({ error: "Could not read sales data." }, 500);

    const partnerIds = [...new Set((sales || []).map(s => s.partner_id).filter(Boolean))];
    const { data: partners, error: partnerError } = partnerIds.length
      ? await admin.from("partners").select("id,partner_code,full_name").in("id", partnerIds)
      : { data: [], error: null };
    if (partnerError) return respond({ error: "Could not read partner references." }, 500);

    const mapped = mapSalesToSheetRows(sales || [], partners || []);
    if (mapped.duplicateIds.length) return respond({ error: "Duplicate sale IDs were returned by the source; sync stopped.", duplicate_ids: mapped.duplicateIds }, 409);
    if (dryRun) {
      return respond({ success: true, dry_run: true, row_count: mapped.rows.length, preview: mapped.rows.slice(0, 5), message: "Preview only. No Google Sheet was read or written." });
    }

    const spreadsheetId = Deno.env.get("GOOGLE_SPREADSHEET_ID");
    const rawCredentials = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    const tab = (Deno.env.get("GOOGLE_SHEET_TAB_NAME") || "Sales").trim();
    if (!spreadsheetId || !rawCredentials || !tab || tab.length > 100 || /[\x00-\x1f]/.test(tab)) {
      return respond({ error: "Google Sheets is not configured. Set the spreadsheet ID, service-account JSON and a valid tab name." }, 503);
    }

    const ownerToken = crypto.randomUUID();
    const { data: acquired, error: lockError } = await admin.rpc("sunora_acquire_sheets_sync_lock", { p_owner_token: ownerToken, p_ttl_seconds: 240 });
    if (lockError) return respond({ error: "Sync lock is not ready. Apply the lock migration before enabling write mode." }, 503);
    if (!acquired) return respond({ error: "Another Google Sheets sync is running. Try again later." }, 409);

    try {
      const token = await googleAccessToken(rawCredentials);
      let values = await readSheetValues(spreadsheetId, tab, token);
      if (!values.length || !values[0]?.length) {
        await writeHeader(spreadsheetId, tab, token);
        values = await readSheetValues(spreadsheetId, tab, token);
      }
      if (JSON.stringify(values[0] || []) !== JSON.stringify(SALES_SHEET_HEADERS)) {
        return respond({ error: "Sheet header mismatch. Sync stopped to avoid writing into the wrong layout." }, 409);
      }

      const baselineValues = await readSheetValues(spreadsheetId, tab, token);
      const baselinePlan = planSalesSheetSync(baselineValues, mapped.rows);
      if (baselinePlan.duplicateExistingIds.length) return respond({ error: "Duplicate sale IDs already exist in the sheet. Resolve duplicates before syncing.", duplicate_ids: baselinePlan.duplicateExistingIds }, 409);
      for (let attempt = 1; attempt <= 3; attempt++) {
        values = await readSheetValues(spreadsheetId, tab, token);
        const plan = planSalesSheetSync(values, mapped.rows);
        if (plan.duplicateExistingIds.length) return respond({ error: "Duplicate sale IDs already exist in the sheet. Resolve duplicates before syncing.", duplicate_ids: plan.duplicateExistingIds }, 409);
        if (!plan.updateRows.length && !plan.appendRows.length && verifyRows(values, mapped.rows)) {
          return respond({ success: true, dry_run: false, verified: true, updated: baselinePlan.updateRows.length, appended: baselinePlan.appendRows.length, attempts: attempt });
        }
        try {
          await applyPlan(spreadsheetId, tab, token, plan);
        } catch (error) {
          const status = (error as Error & { status?: number }).status;
          if (status && status < 500 && status !== 429) throw error;
          // Ambiguous network/5xx failure: re-read next attempt before append.
        }
        const after = await readSheetValues(spreadsheetId, tab, token);
        if (verifyRows(after, mapped.rows)) {
          return respond({ success: true, dry_run: false, verified: true, updated: baselinePlan.updateRows.length, appended: baselinePlan.appendRows.length, attempts: attempt });
        }
      }
      return respond({ success: false, verified: false, error: "Sync could not be verified after three attempts. Retry is safe because rows use stable sale IDs and a service-role lock." }, 502);
    } finally {
      await admin.rpc("sunora_release_sheets_sync_lock", { p_owner_token: ownerToken }).catch(() => {});
    }
  } catch (error) {
    console.error("sheets-sync failure", { error_type: error instanceof Error ? error.name : "UnknownError" });
    return respond({ error: error instanceof Error ? error.message : "Sheets sync failed." }, 500);
  }
});
