import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const migrationDir = new URL('../supabase/migrations/', import.meta.url);

test('migration filenames match the applied live migration history', async () => {
  const files = (await readdir(migrationDir)).filter(file => file.endsWith('.sql')).sort();
  assert.deepEqual(files, [
    '20261126083905_create_partner_referrals_pipeline.sql',
    '20261126084620_partner_social_media_profiles.sql',
    '20261126102114_optimize_rls_auth_initplan.sql',
    '20261126102347_restrict_secdef_function_exec.sql',
    '20261126111123_atomic_sale_bundle_referral_integrity.sql',
    '20261126111157_sale_bundle_validation_rounding_fix.sql',
    '20261126115630_profit_payout_workflow.sql',
    '20261126120922_profit_payout_role_guard_null_fix.sql',
    '20261126121202_index_uncovered_foreign_keys.sql',
    '20261126173908_unique_profit_payout_per_commission.sql',
    '20261126184841_20261126180000_remove_redundant_payout_unique_index.sql',
    '20261126185733_20261126190000_restrict_public_table_privileges.sql',
    '20261126203001_partner_referral_status_notifications.sql',
    '20261126203714_partner_recursive_branch_read.sql',
    '20261126204000_partner_branch_partner_role_guard.sql'
  ]);
});

test('referrals baseline migration creates the table, scoped RLS policies, and trigger without anon grants', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261126083905_create_partner_referrals_pipeline.sql', import.meta.url), 'utf8');
  for (const fragment of [
    'CREATE TABLE public.referrals',
    'contact_name text NOT NULL CHECK',
    "status text NOT NULL DEFAULT 'New'",
    'created_by uuid NOT NULL DEFAULT auth.uid()',
    'CREATE INDEX referrals_partner_created_idx',
    'CREATE INDEX referrals_status_created_idx',
    'CREATE OR REPLACE FUNCTION public.set_referrals_updated_at()',
    'CREATE TRIGGER referrals_set_updated_at',
    'ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY',
    'CREATE POLICY referrals_read_own_or_staff',
    'CREATE POLICY referrals_partner_insert_own',
    'CREATE POLICY referrals_staff_update',
    'CREATE POLICY referrals_staff_delete',
    'REVOKE ALL ON TABLE public.referrals FROM PUBLIC, anon, authenticated, service_role',
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.referrals TO authenticated',
    'GRANT ALL ON TABLE public.referrals TO service_role'
  ]) assert.ok(sql.includes(fragment), `Missing expected migration fragment: ${fragment}`);
  assert.ok(!sql.includes('GRANT ALL ON TABLE public.referrals TO anon'));
  assert.ok(!sql.includes('TRUNCATE'));
});

test('social profile migration uses a non-null empty-object JSONB default', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261126084620_partner_social_media_profiles.sql', import.meta.url), 'utf8');
  assert.ok(sql.includes('ADD COLUMN social_media_profiles jsonb NOT NULL DEFAULT'));
  assert.ok(sql.includes("'{}'::jsonb"));
});

test('public table ACL hardening removes anon and truncate privileges from exposed RLS tables while preserving authenticated CRUD', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261126185733_20261126190000_restrict_public_table_privileges.sql', import.meta.url), 'utf8');
  const tables = ['public.referrals', 'public.commission_payouts', 'public.sale_commissions', 'public.sale_project_costs', 'public.sunora_audit_log', 'public.sunora_product_prices'];
  for (const table of tables) assert.ok(sql.includes(table), `Missing hardened table: ${table}`);
  assert.ok(sql.includes('FROM PUBLIC, anon, authenticated'));
  assert.ok(sql.includes('SELECT, INSERT, UPDATE, DELETE'));
  assert.ok(sql.includes('TO authenticated'));
  assert.ok(sql.includes('TO service_role'));
  assert.ok(!/^\s*TRUNCATE\b/mi.test(sql));
  assert.ok(!sql.includes('DROP TABLE'));
  assert.ok(!sql.includes('DELETE FROM'));
});
