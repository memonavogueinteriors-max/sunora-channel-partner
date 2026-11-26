import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20261126203714_partner_recursive_branch_read.sql', import.meta.url);
const appPath = new URL('../src/App.jsx', import.meta.url);

test('recursive branch RPC is cycle-safe and exposes only display fields', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.sunora_get_partner_branch\(\)/);
  assert.match(sql, /RETURNS TABLE/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path TO 'public', 'pg_temp'/);
  assert.match(sql, /WITH RECURSIVE branch AS/);
  assert.match(sql, /UNION\s+SELECT child\.id/);
  assert.ok(!sql.includes('UNION ALL'), 'UNION should deduplicate and stop partner-tree cycles');
  for (const sensitiveColumn of ['email', 'phone', 'date_of_birth', 'social_media_profiles']) assert.ok(!sql.includes(sensitiveColumn));
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.sunora_get_partner_branch\(\) FROM PUBLIC, anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.sunora_get_partner_branch\(\) TO authenticated/);
  assert.match(sql, /p\.id = public\.current_partner_id\(\)/);
});

test('partner network view uses the recursive RPC while retaining own-branch root', async () => {
  const app = await readFile(appPath, 'utf8');
  assert.ok(app.includes("supabase.rpc('sunora_get_partner_branch')"));
  assert.ok(app.includes('const branchNetworkRows = isStaff ? partners : (branchPartners.length ? branchPartners : scopedPartners);'));
  assert.ok(app.includes('branchNetworkRows.filter(p => p.id === ownPartner?.id)'));
  assert.ok(app.includes('all={isStaff ? partners : branchNetworkRows}'));
});
test('recursive branch RPC seed is explicitly restricted to partner role', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261126203945_partner_branch_partner_role_guard.sql', import.meta.url), 'utf8');
  assert.match(sql, /p\.id = public\.current_partner_id\(\)/);
  assert.match(sql, /public\.current_user_role\(\) = 'partner'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.sunora_get_partner_branch\(\) FROM PUBLIC, anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.sunora_get_partner_branch\(\) TO authenticated/);
});
