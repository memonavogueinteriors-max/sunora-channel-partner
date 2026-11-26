import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20261126202500_partner_referral_status_notifications.sql', import.meta.url);

test('referral status notifications fire only for status changes and target the linked partner', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  for (const fragment of [
    'CREATE OR REPLACE FUNCTION public.sunora_partner_referral_status_notification()',
    'SECURITY DEFINER',
    "SET search_path TO 'public', 'pg_temp'",
    'OLD.status IS DISTINCT FROM NEW.status',
    'SELECT p.user_id',
    'FROM public.partners p',
    'WHERE p.id = NEW.partner_id',
    'INSERT INTO public.notifications',
    "'referral_status_changed'",
    "'referrals'",
    'NEW.id',
    "'previous_status', OLD.status",
    "'new_status', NEW.status",
    'AFTER UPDATE OF status ON public.referrals',
    'EXECUTE FUNCTION public.sunora_partner_referral_status_notification()',
    'REVOKE ALL ON FUNCTION public.sunora_partner_referral_status_notification()'
  ]) assert.ok(sql.includes(fragment), 'Missing notification migration fragment: ' + fragment);
  assert.ok(!sql.toLowerCase().includes('email'));
});

test('notification text distinguishes conversion, lost, and ordinary status updates', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /WHEN NEW\.status = 'Converted' THEN 'Referral Converted'/);
  assert.match(sql, /WHEN NEW\.status = 'Lost' THEN 'Referral Closed'/);
  assert.match(sql, /ELSE 'Referral Status Updated'/);
  assert.match(sql, /changed from ' \|\| OLD\.status \|\| ' to ' \|\| NEW\.status/);
});
