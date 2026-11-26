import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPartnerStatementPdf } from '../src/statementPdf.js';

const sample = {
  monthLabel: 'November 2026',
  partner: { full_name: 'Memona (Test) Partner', partner_code: 'CH202611001', status: 'active' },
  sales: [{ invoice_number: 'SUN-001', invoice_date: '2026-11-10', panel_quantity: 4, invoice_currency: 'AED', subtotal_ex_vat: 1000, vat_amount: 50, total_inc_vat: 1050 }],
  profits: [{ invoice_number: 'SUN-001', panel_quantity: 4, commission_currency: 'AED', commissionable_base_amount: 1000, commission_rate: 5, commission_amount: 50, approval_status: 'approved', eligibility_status: 'eligible' }],
  profitSummary: [{ currency: 'AED', eligible: 50, paid: 0, pending: 50, outstanding: 50 }],
  payouts: [{ date: '2026-11-22', amount: 10, currency: 'AED', status: 'pending', payment_reference: 'QA (none)' }]
};

test('partner statement PDF has a valid PDF header, one page and partner-specific statement text', () => {
  const bytes = buildPartnerStatementPdf(sample);
  const pdf = new TextDecoder().decode(bytes);
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 500);
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.match(pdf, /\/Count 1/);
  assert.ok(pdf.includes('Memona \\(Test\\) Partner'));
  assert.match(pdf, /SUN-001/);
  assert.match(pdf, /Payment History|PAYMENT HISTORY/);
  assert.match(pdf, /xref\n0 6\n/);
});

test('PDF cross-reference offsets point to the correct objects', () => {
  const pdf = new TextDecoder().decode(buildPartnerStatementPdf(sample));
  const xref = pdf.match(/xref\n0 (\d+)\n([\s\S]*?)trailer/);
  assert.ok(xref, 'xref table should exist');
  const objectCount = Number(xref[1]);
  const entries = xref[2].trimEnd().split('\n');
  assert.equal(entries.length, objectCount);
  for (let id = 1; id < objectCount; id++) {
    const offset = Number(entries[id].slice(0, 10));
    assert.equal(pdf.slice(offset, offset + (String(id) + ' 0 obj').length), String(id) + ' 0 obj');
  }
});

test('long statements paginate and remove unsupported Unicode safely', () => {
  const data = { ...sample, partner: { ...sample.partner, full_name: 'Zoë ☀ Partner' }, sales: Array.from({ length: 100 }, (_, i) => ({ ...sample.sales[0], invoice_number: 'INV-' + (i + 1) })) };
  const pdf = new TextDecoder().decode(buildPartnerStatementPdf(data));
  assert.match(pdf, /\/Count 5/);
  assert.match(pdf, /Page 5 of 5/);
  assert.ok(!pdf.includes('☀'));
  assert.match(pdf, /Zoe \? Partner/);
});
