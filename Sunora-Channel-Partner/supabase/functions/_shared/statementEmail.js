const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[char]);
const safeSubject = value => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
const PORTAL_URL = 'https://sunora-channel-partner.vercel.app';
export function buildMonthlyStatementEmail({ partnerName, partnerCode, month, monthLabel, portalUrl = PORTAL_URL } = {}) {
  if (!String(partnerName ?? '').trim()) throw new Error('Partner name is required.');
  if (!String(partnerCode ?? '').trim()) throw new Error('Partner code is required.');
  if (!/^\d{4}-\d{2}$/.test(String(month ?? ''))) throw new Error('Month must use YYYY-MM format.');
  const parsedUrl = new URL(portalUrl);
  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'sunora-channel-partner.vercel.app' || parsedUrl.pathname !== '/' || parsedUrl.search || parsedUrl.hash) {
    throw new Error('Portal URL must be the approved SUNORA portal origin.');
  }
  const name = String(partnerName).trim(), code = String(partnerCode).trim(), label = String(monthLabel ?? month).trim();
  const subject = safeSubject('SUNORA Monthly Statement — ' + label);
  const attachmentFilename = 'sunora-monthly-statement-' + month + '.pdf';
  const portal = escapeHtml(PORTAL_URL);
  const html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#252525">' +
    '<div style="background:#111;padding:22px;color:#d1a45b;font-weight:700;letter-spacing:2px">SUNORA™</div>' +
    '<h2 style="margin-top:28px">Your monthly statement is ready</h2>' +
    '<p>Hello ' + escapeHtml(name) + ',</p>' +
    '<p>Your SUNORA partner statement for <strong>' + escapeHtml(label) + '</strong> is prepared for review.</p>' +
    '<p><strong>Partner ID:</strong> ' + escapeHtml(code) + '</p>' +
    '<p>Open your secure partner portal to review your statement and download the PDF.</p>' +
    '<p><a href="' + portal + '" style="display:inline-block;background:#b58a45;color:#fff;padding:12px 20px;text-decoration:none;border-radius:5px">Open Partner Portal</a></p>' +
    '<p style="font-size:12px;color:#666">This message is a statement notice. Payment amounts remain subject to approval and eligibility checks.</p>' +
    '<p>SUNORA Partner Team</p></div>';
  const text = 'Hello ' + name + ', your SUNORA monthly statement for ' + label + ' is ready. Partner ID: ' + code + '. Review and download it at ' + PORTAL_URL + '.';
  return { subject, html, text, attachmentFilename, portalUrl: PORTAL_URL };
}
