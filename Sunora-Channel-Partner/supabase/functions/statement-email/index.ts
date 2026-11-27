import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://sunora-channel-partner.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const safeErr=(id:string)=>({error:"Statement email could not be sent. Contact support with the request ID.",request_id:id});

Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return respond({error:"Method not allowed."},405);
  const requestId=crypto.randomUUID();
  try{
    const auth=req.headers.get("Authorization")||"";
    const jwt=auth.replace(/^Bearer\s+/i,"");
    if(!jwt) return respond({error:"Authentication required."},401);
    const supabaseUrl=Deno.env.get("SUPABASE_URL");
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey=Deno.env.get("RESEND_API_KEY");
    if(!supabaseUrl||!serviceKey||!resendKey) return respond(safeErr(requestId),503);
    const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
    const {data:userData,error:userError}=await admin.auth.getUser(jwt);
    if(userError||!userData.user) return respond({error:"Authentication failed."},401);
    const {data:profile,error:profileError}=await admin.from("profiles").select("role").eq("id",userData.user.id).maybeSingle();
    if(profileError||!profile||!["admin","staff"].includes(profile.role)) return respond({error:"Not authorized."},403);
    const body=await req.json();
    const partnerId=String(body.partnerId||"");
    const month=String(body.month||"");
    const pdfBase64=String(body.pdfBase64||"");
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(partnerId)) return respond({error:"Invalid partner ID."},400);
    if(!/^\\d{4}-\\d{2}$/.test(month)) return respond({error:"Month must use YYYY-MM."},400);
    if(!pdfBase64||pdfBase64.length>7_000_000) return respond({error:"PDF attachment is missing or too large."},413);
    const bytes=Uint8Array.from(atob(pdfBase64),c=>c.charCodeAt(0));
    if(bytes.length>5_000_000||new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-") return respond({error:"Invalid PDF attachment."},400);
    const {data:partner,error:partnerError}=await admin.from("partners").select("id,full_name,partner_code,email,status").eq("id",partnerId).maybeSingle();
    if(partnerError||!partner) return respond({error:"Partner not found."},404);
    if(partner.status!=="active") return respond({error:"Statements can only be sent to active partners."},409);
    const recipient=String(partner.email||"").trim();
    if(!recipient||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return respond({error:"Partner has no valid registered email address."},409);
    const {data:existing,error:logError}=await admin.from("statement_email_log").select("id,status").eq("partner_id",partnerId).eq("statement_month",month).maybeSingle();
    if(logError) return respond(safeErr(requestId),500);
    if(existing?.status==="sent"||existing?.status==="pending") return respond({error:existing.status==="sent"?"Statement already sent for this month.":"Statement send is already in progress."},409);
    let logId:string;
    if(existing?.id){
      const {data:updated,error}=await admin.from("statement_email_log").update({recipient_email:recipient,status:"pending",error_message:null,created_by:userData.user.id,updated_at:new Date().toISOString()}).eq("id",existing.id).select("id").single();
      if(error||!updated) return respond(safeErr(requestId),500);
      logId=updated.id;
    }else{
      const {data:inserted,error}=await admin.from("statement_email_log").insert({partner_id:partnerId,statement_month:month,recipient_email:recipient,status:"pending",created_by:userData.user.id}).select("id").single();
      if(error||!inserted) return respond(error?.code==="23505"?{error:"Statement send is already in progress or was sent."}:safeErr(requestId),error?.code==="23505"?409:500);
      logId=inserted.id;
    }
    const monthLabel=new Date(month+"-01T00:00:00Z").toLocaleDateString("en-US",{month:"long",year:"numeric",timeZone:"UTC"});
    const subject="SUNORA Monthly Statement — "+monthLabel;
    const portalUrl="https://sunora-channel-partner.vercel.app";
    const html=`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#252525"><div style="background:#111;padding:22px;color:#d1a45b;font-weight:700;letter-spacing:2px">SUNORA™</div><h2>Your monthly statement is ready</h2><p>Hello ${partner.full_name.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))},</p><p>Your SUNORA partner statement for <strong>${monthLabel}</strong> is attached as a PDF.</p><p><strong>Partner ID:</strong> ${partner.partner_code}</p><p><a href="${portalUrl}" style="display:inline-block;background:#b58a45;color:#fff;padding:12px 20px;text-decoration:none;border-radius:5px">Open Partner Portal</a></p><p style="font-size:12px;color:#666">This is a statement notice. Profit amounts remain subject to approval and eligibility.</p><p>SUNORA Channel Program</p></div>`;
    const res=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+resendKey,"Content-Type":"application/json"},body:JSON.stringify({from:"SUNORA Channel Program <info@sunora.ae>",to:[recipient],subject,html,attachments:[{filename:"sunora-monthly-statement-"+month+".pdf",content:pdfBase64}]})});
    const responseText=await res.text();
    if(!res.ok){
      await admin.from("statement_email_log").update({status:"failed",error_message:"Resend HTTP "+res.status,updated_at:new Date().toISOString()}).eq("id",logId);
      return respond({error:"Email provider rejected the send request.",request_id:requestId},502);
    }
    let responseJson={id:null};try{responseJson=JSON.parse(responseText)}catch{}
    await admin.from("statement_email_log").update({status:"sent",resend_id:responseJson.id||null,sent_at:new Date().toISOString(),error_message:null,updated_at:new Date().toISOString()}).eq("id",logId);
    return respond({success:true,partner:partner.partner_code,month,request_id:requestId});
  }catch{
    return respond(safeErr(requestId),500);
  }
});
