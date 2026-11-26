const encoder = new TextEncoder();
const textSafe = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?');
const escapePdf = value => textSafe(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const amount = (value, currency = 'AED') => textSafe(currency || 'AED') + ' ' + (Number.isFinite(Number(value ?? 0)) ? Number(value ?? 0) : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function wrap(value, width = 92) {
  const words = textSafe(value).split(/\s+/).filter(Boolean), result = [];
  if (!words.length) return [''];
  let line = '';
  for (const word of words) {
    if (word.length > width) { if (line) result.push(line); for (let i = 0; i < word.length; i += width) result.push(word.slice(i, i + width)); line = ''; }
    else if (line && (line + ' ' + word).length > width) { result.push(line); line = word; }
    else line = line ? line + ' ' + word : word;
  }
  if (line) result.push(line);
  return result;
}
function section(lines, title, entries) {
  lines.push('', title);
  if (!entries.length) lines.push('No records for this section.');
  else entries.forEach(entry => lines.push(...wrap(entry)));
}
function statementLines(statement = {}) {
  const partner = statement.partner || {}, sales = Array.isArray(statement.sales) ? statement.sales : [], profits = Array.isArray(statement.profits) ? statement.profits : [], payouts = Array.isArray(statement.payouts) ? statement.payouts : [], summaries = Array.isArray(statement.profitSummary) ? statement.profitSummary : [];
  const lines = ['SUNORA PARTNER STATEMENT', 'Statement month: ' + (statement.monthLabel || statement.month || 'Not specified'), 'Partner: ' + (partner.full_name || 'Not specified'), 'Partner ID: ' + (partner.partner_code || 'Not specified'), 'Account status: ' + (partner.status || 'active'), 'Invoice count: ' + sales.length, 'Panels invoiced: ' + sales.reduce((sum, s) => sum + Number(s.panel_quantity ?? s.quantity ?? 0), 0)];
  const currencies = [...new Set(sales.map(s => s.invoice_currency || 'AED'))];
  section(lines, 'SALES TOTALS', currencies.map(currency => currency + ': ' + amount(sales.filter(s => (s.invoice_currency || 'AED') === currency).reduce((sum, s) => sum + Number(s.total_inc_vat ?? s.invoice_amount ?? 0), 0), currency)));
  section(lines, 'INVOICES', sales.flatMap(s => ['Invoice ' + (s.invoice_number || '—') + ' | Date ' + (s.invoice_date || '—') + ' | Panels ' + Number(s.panel_quantity ?? s.quantity ?? 0) + ' | Total ' + amount(s.total_inc_vat ?? s.invoice_amount, s.invoice_currency), 'Subtotal ' + amount(s.subtotal_ex_vat, s.invoice_currency) + ' | VAT ' + amount(s.vat_amount, s.invoice_currency)]));
  section(lines, 'PROFIT SUMMARY', summaries.map(x => x.currency + ': Eligible ' + amount(x.eligible, x.currency) + ' | Paid ' + amount(x.paid, x.currency) + ' | Pending ' + amount(x.pending, x.currency) + ' | Outstanding estimate ' + amount(x.outstanding, x.currency)));
  section(lines, 'PROFIT RECORDS', profits.flatMap(c => ['Invoice ' + (c.invoice_number || '—') + ' | Panels ' + Number(c.panel_quantity || 0) + ' | Base ' + amount(c.commissionable_base_amount, c.commission_currency) + ' | Rate ' + (c.commission_rate == null ? 'Pending' : c.commission_rate + '%'), 'Profit ' + (c.commission_amount == null ? 'Pending' : amount(c.commission_amount, c.commission_currency)) + ' | Approval ' + (c.approval_status || '—') + ' | Eligibility ' + (c.eligibility_status || '—') + (c.approval_comments ? ' | Note ' + c.approval_comments : '')]));
  section(lines, 'PAYMENT HISTORY', payouts.flatMap(p => ['Date ' + (p.date || '—') + ' | Amount ' + amount(p.amount, p.currency) + ' | Status ' + (p.status || '—'), 'Reference ' + (p.payment_reference || '—')]));
  lines.push('', 'Read-only statement. Profit is not payable until required approvals and eligibility checks are complete.');
  return lines.flatMap(line => wrap(line));
}
export function buildPartnerStatementPdf(statement = {}) {
  const lines = statementLines(statement), pages = [];
  for (let i = 0; i < lines.length; i += 48) pages.push(lines.slice(i, i + 48));
  if (!pages.length) pages.push(['SUNORA PARTNER STATEMENT']);
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'], pageRefs = [];
  pages.forEach((page, index) => {
    const pageId = 4 + index * 2, contentId = pageId + 1;
    pageRefs.push(pageId + ' 0 R');
    const commands = ['BT', '/F1 14 Tf', '50 790 Td', '(SUNORA PARTNER STATEMENT - Page ' + (index + 1) + ' of ' + pages.length + ') Tj', '/F1 9 Tf', '13 TL', 'T*', ...page.flatMap(line => ['(' + escapePdf(line) + ') Tj', 'T*']), 'ET'].join('\n');
    objects[pageId - 1] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + contentId + ' 0 R >>';
    objects[contentId - 1] = '<< /Length ' + encoder.encode(commands).length + ' >>\nstream\n' + commands + '\nendstream';
  });
  objects[1] = '<< /Type /Pages /Kids [' + pageRefs.join(' ') + '] /Count ' + pages.length + ' >>';
  let pdf = '%PDF-1.4\n', byteLength = encoder.encode(pdf).length;
  const offsets = [0];
  objects.forEach((body, index) => {
    const id = index + 1; offsets[id] = byteLength;
    const obj = id + ' 0 obj\n' + body + '\nendobj\n'; pdf += obj; byteLength += encoder.encode(obj).length;
  });
  const xref = byteLength;
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
offsets.slice(1).forEach(offset => { pdf += String(offset).padStart(10, '0') + ' 00000 n \n'; });
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return encoder.encode(pdf);
}
