import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlyStatementEmail } from '../supabase/functions/_shared/statementEmail.js';

const valid = { partnerName:'Test Partner', partnerCode:'CH202611001', month:'2026-11', monthLabel:'November 2026' };
test('creates a monthly statement notice without sending email',()=>{
  const email=buildMonthlyStatementEmail(valid);
  assert.equal(email.subject,'SUNORA Monthly Statement — November 2026');
  assert.match(email.html,/Open Partner Portal/);
  assert.match(email.text,/November 2026/);
  assert.equal(email.attachmentFilename,'sunora-monthly-statement-2026-11.pdf');
  assert.equal(email.portalUrl,'https://sunora-channel-partner.vercel.app');
});
test('escapes partner name and code in HTML',()=>{
  const email=buildMonthlyStatementEmail({...valid,partnerName:'<script>alert(1)</script>',partnerCode:'X&Y'});
  assert.ok(!email.html.includes('<script>'));
  assert.ok(email.html.includes('&lt;script&gt;'));
  assert.ok(email.html.includes('X&amp;Y'));
});
test('rejects invalid month and arbitrary portal host',()=>{
  assert.throws(()=>buildMonthlyStatementEmail({...valid,month:'November 2026'}),/YYYY-MM/);
  assert.throws(()=>buildMonthlyStatementEmail({...valid,portalUrl:'https://evil.example/'}),/approved SUNORA portal/);
});
