import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { welcomeEmailHtml } from "./welcome-email.ts";
const cors={"Access-Control-Allow-Origin":"https://sunora-channel-partner.vercel.app","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return response({error:"Method not allowed"},405);
 try{
  const jwt=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!jwt)return response({error:"Authentication required."},401);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),resend=Deno.env.get("RESEND_API_KEY");
  if(!url||!key||!resend)return response({error:"Email service configuration is missing."},503);
  const admin=createClient(url,key,{auth:{persistSession:false}});
  const {data:user,error:userErr}=await admin.auth.getUser(jwt);
  if(userErr||!user.user)return response({error:"Authentication failed."},401);
  const {data:profile,error:profileErr}=await admin.from("profiles").select("role").eq("id",user.user.id).maybeSingle();
  if(profileErr||profile?.role!=="admin")return response({error:"Admin access only."},403);
  const recipient=user.user.email;
  if(!recipient)return response({error:"Your account has no email address."},400);
  const html=welcomeEmailHtml({name:"Sample Channel Partner",partnerCode:"CH-DEMO-000",joinDate:"27 Nov 2026",actionUrl:"https://sunora-channel-partner.vercel.app",test:true});
  const send=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+resend,"Content-Type":"application/json"},body:JSON.stringify({from:"SUNORA Channel Partner Program <info@sunora.ae>",to:[recipient],subject:"SUNORA Welcome Email — Design Test",html})});
  if(!send.ok)return response({error:"Resend could not deliver the test email. Please check provider configuration."},502);
  return response({success:true,message:"Test email sent to your signed-in admin email address.",recipient});
 }catch{return response({error:"Test email failed. Please retry or contact support."},500)}
});
