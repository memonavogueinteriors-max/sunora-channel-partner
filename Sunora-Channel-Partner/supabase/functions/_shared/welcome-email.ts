const escapeHtml=(value:string)=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
export function welcomeEmailHtml({name,partnerCode,joinDate,actionUrl,test=false}:{name:string;partnerCode:string;joinDate:string;actionUrl:string;test?:boolean}) {
 const safeName=escapeHtml(name),safeCode=escapeHtml(partnerCode),safeDate=escapeHtml(joinDate),safeUrl=escapeHtml(actionUrl);
 const logo="https://sunora-channel-partner.vercel.app/sunora-logo.png";
 return `<!doctype html><html><body style="margin:0;background:#f7f6f2;padding:24px 10px;font-family:Arial,Helvetica,sans-serif;color:#252525">
 <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #eee7db;border-radius:12px;overflow:hidden">
 <div style="padding:30px 26px 20px;text-align:center;border-bottom:1px solid #eee7db">
 <img src="${logo}" alt="SUNORA — Your Wellness Sun" width="240" style="display:block;max-width:80%;height:auto;margin:0 auto 14px"/>
 <div style="color:#9b742d;font-size:12px;letter-spacing:3px;text-transform:uppercase">Channel Partner Program</div>
 </div>
 <div style="padding:30px 32px">
 <p style="margin:0 0 16px;font-size:16px">Dear <strong>${safeName}</strong>,</p>
 <h1 style="font-size:24px;line-height:1.35;font-weight:600;color:#2b2b2b;margin:0 0 18px">Welcome to the SUNORA Channel Partner Program!</h1>
 <p style="font-size:15px;line-height:1.7;margin:0 0 14px">We are delighted to have you join our growing network of partners. Thank you for choosing SUNORA and sharing our vision of bringing natural sunlight and wellness into indoor spaces.</p>
 <p style="font-size:15px;line-height:1.7;margin:0 0 20px">As a SUNORA Channel Partner, you can introduce our innovative solutions to your network, generate referrals, and grow alongside us.</p>
 <div style="background:#fbf8f1;border:1px solid #eadcc0;border-radius:8px;padding:18px 20px;margin:22px 0">
 <div style="font-size:12px;color:#92702f;text-transform:uppercase;letter-spacing:1.4px;margin-bottom:12px">Your Partner Details</div>
 <div style="font-size:14px;line-height:1.8"><strong>Partner name:</strong> ${safeName}<br/><strong>Partner ID:</strong> ${safeCode}<br/><strong>Joining date:</strong> ${safeDate}</div></div>
 <p style="font-size:15px;line-height:1.7;margin:0 0 20px">Your partner portal helps you track referrals, monitor your activity, and stay up to date with your partnership.</p>
 <div style="text-align:center;margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#b58a45;color:#fff;text-decoration:none;font-size:15px;font-weight:bold;padding:14px 28px;border-radius:6px"> ${test?"Explore Partner Portal":"Set Your Password & Get Started"} </a></div>
 ${test?'<p style="font-size:12px;color:#8a6d3d;text-align:center">This is a test preview email. No partner account or invitation was created.</p>': '<p style="font-size:13px;color:#777;line-height:1.6">If the button does not work, copy and paste this link into your browser:<br/><a href="'+safeUrl+'" style="color:#9b742d;word-break:break-all">'+safeUrl+'</a></p>'}
 <p style="font-size:15px;line-height:1.7;margin:22px 0 0">We look forward to building a successful and rewarding partnership with you.</p>
 <p style="font-size:15px;line-height:1.7;margin:24px 0 0">Warm regards,<br/><strong>SUNORA Channel Partner Program</strong><br/><span style="color:#9b742d">Your Wellness Sun</span></p>
 </div>
 <div style="background:#f7f6f2;padding:20px;text-align:center;border-top:1px solid #eee7db;font-size:12px;color:#666;line-height:1.8">
 <div style="color:#9b742d;font-weight:bold;letter-spacing:2px;margin-bottom:4px">SUNORA™</div>Channel Partner Program<br/>Support: <a href="mailto:info@sunora.ae" style="color:#9b742d">info@sunora.ae</a> · <a href="https://www.sunora.ae" style="color:#9b742d">www.sunora.ae</a>
 </div></div></body></html>`;
}
