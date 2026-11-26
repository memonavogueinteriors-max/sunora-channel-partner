import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getPayableProfits,
  getAvailableProfits,
  getPayoutSummaryByCurrency
} from '../src/payouts.js';

const commissions = [
  { id: 'aed-pending', approval_status: 'approved', eligibility_status: 'eligible', commission_amount: 100, commission_currency: 'AED', commission_rate: 5, rate_status: 'tier_approved' },
  { id: 'aed-available', approval_status: 'approved', eligibility_status: 'eligible', commission_amount: 50, commission_currency: 'AED', commission_rate: 10, rate_status: 'tier_approved' },
  { id: 'usd-paid', approval_status: 'approved', eligibility_status: 'eligible', commission_amount: 200, commission_currency: 'USD', commission_rate: 15, rate_status: 'manually_approved' },
  { id: 'manual-rate-waiting', approval_status: 'approved', eligibility_status: 'eligible', commission_amount: 75, commission_currency: 'AED', commission_rate: 5, rate_status: 'awaiting_manual_rate' },
  { id: 'not-approved', approval_status: 'recorded', eligibility_status: 'eligible', commission_amount: 25, commission_currency: 'AED', commission_rate: 5, rate_status: 'tier_approved' },
  { id: 'not-eligible', approval_status: 'approved', eligibility_status: 'pending', commission_amount: 40, commission_currency: 'AED', commission_rate: 5, rate_status: 'tier_approved' },
  { id: 'zero-profit', approval_status: 'approved', eligibility_status: 'eligible', commission_amount: 0, commission_currency: 'AED', commission_rate: 0, rate_status: 'tier_approved' },
  { id: 'negative-profit', approval_status: 'approved', eligibility_status: 'eligible', commission_amount: -1, commission_currency: 'AED', commission_rate: 5, rate_status: 'tier_approved' },
  { id: 'missing-rate', approval_status: 'approved', eligibility_status: 'eligible', commission_amount: 20, commission_currency: 'AED', commission_rate: null, rate_status: 'awaiting_manual_rate' },
  { id: 'undefined-rate', approval_status: 'approved', eligibility_status: 'eligible', commission_amount: 20, commission_currency: 'AED', rate_status: 'tier_approved' },
  { id: 'default-currency', approval_status: 'approved', eligibility_status: 'eligible', commission_amount: 25, commission_rate: 5, rate_status: 'tier_approved' }
];

const payouts = [
  { commission_id: 'aed-pending', amount: 100, currency: 'AED', status: 'pending' },
  { commission_id: 'usd-paid', amount: 200, currency: 'USD', status: 'paid' },
  { commission_id: 'default-currency', amount: 25, status: 'pending' }
];

test('payable profits require approval, eligibility, positive amount, and a settled rate', () => {
  const payable = getPayableProfits(commissions);
  assert.deepEqual(
    payable.map(c => c.id),
    ['aed-pending', 'aed-available', 'usd-paid', 'default-currency']
  );
});

test('available profit excludes commissions already pending or paid', () => {
  const payable = getPayableProfits(commissions);
  const available = getAvailableProfits(payable, payouts);
  assert.deepEqual(available.map(c => c.id), ['aed-available']);
});

test('balances are separated by currency and reconcile to eligible, pending, paid, and available', () => {
  const payable = getPayableProfits(commissions);
  const available = getAvailableProfits(payable, payouts);
  const summary = getPayoutSummaryByCurrency(payable, payouts, available);
  assert.deepEqual(summary, [
    { currency: 'AED', eligible: 175, pending: 125, paid: 0, available: 50 },
    { currency: 'USD', eligible: 200, pending: 0, paid: 200, available: 0 }
  ]);
});

test('migration preflights null and duplicate commission links, then adds a unique index', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261126173908_unique_profit_payout_per_commission.sql', import.meta.url), 'utf8');
  assert.ok(sql.includes('WHERE commission_id IS NULL'));
  assert.ok(sql.includes('GROUP BY commission_id'));
  assert.ok(sql.includes('HAVING COUNT(*) > 1'));
  assert.ok(sql.includes('ALTER COLUMN commission_id SET NOT NULL'));
  assert.ok(sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS commission_payouts_commission_id_uidx'));
  assert.ok(!sql.includes('DROP TABLE'));
  assert.ok(!sql.includes('DELETE FROM'));
  assert.ok(!sql.includes('TRUNCATE'));
});

test('cleanup migration verifies the retained commission_id constraint and drops only the redundant index', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261126180000_remove_redundant_payout_unique_index.sql', import.meta.url), 'utf8');
  assert.ok(sql.includes('commission_payouts_commission_id_key'));
  assert.ok(sql.includes('commission_id IS NULL'));
  assert.ok(sql.includes('DROP INDEX IF EXISTS public.commission_payouts_commission_id_uidx'));
  assert.ok(!sql.includes('DROP CONSTRAINT'));
  assert.ok(!sql.includes('DROP TABLE'));
  assert.ok(!sql.includes('DELETE FROM'));
  assert.ok(!sql.includes('TRUNCATE'));
});

test('existing payout RPC serializes by commission and returns an existing payout on retry', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261126115630_profit_payout_workflow.sql', import.meta.url), 'utf8');
  assert.ok(sql.includes('WHERE id = p_commission_id FOR UPDATE'));
  assert.ok(sql.includes('WHERE commission_id = p_commission_id FOR UPDATE'));
  assert.match(sql, /IF FOUND THEN\s+RETURN v_existing/i);
  assert.ok(sql.includes('NEW.amount IS DISTINCT FROM v_profit'));
  assert.ok(sql.includes('NEW.currency IS DISTINCT FROM v_currency'));
});

test('paid confirmation requires an Admin role, date, and reference with null-safe checks', async () => {
  const roleFix = await readFile(new URL('../supabase/migrations/20261126120922_profit_payout_role_guard_null_fix.sql', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(roleFix.includes("coalesce(public.current_user_role(), '') <> 'admin'"));
  assert.ok(app.includes("isAdmin && p.status === 'pending'"));
  assert.ok(app.includes('sunora_mark_profit_payout_paid'));
  assert.ok(app.includes('Payment date and reference are required'));
});

test('Accounts payout UI is restricted to Staff/Admin and calls the guarded creation RPC', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(app.includes("(isStaff ? [{ name: 'Profit Payouts'"));
  assert.ok(app.includes("tab === 'Profit Payouts' && isStaff"));
  assert.ok(app.includes('sunora_create_profit_payout'));
});
