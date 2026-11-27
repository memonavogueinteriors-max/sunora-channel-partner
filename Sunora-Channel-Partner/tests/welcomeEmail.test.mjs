import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const templatePath = new URL('../supabase/functions/_shared/welcome-email.ts', import.meta.url);
const invitePath = new URL('../supabase/functions/partner-invite/index.ts', import.meta.url);
const testEndpointPath = new URL('../supabase/functions/welcome-email-test/index.ts', import.meta.url);
const appPath = new URL('../src/App.jsx', import.meta.url);

test('welcome email template is branded, personalized, and test-mode safe', async () => {
  const template = await readFile(templatePath, 'utf8');
  assert.ok(template.includes('SUNORA™'));
  assert.ok(template.includes('#b58a45'));
  assert.ok(template.includes('Channel Partner Program'));
  assert.ok(template.includes('Partner ID'));
  assert.ok(template.includes('Your Wellness Sun'));
  assert.ok(template.includes('test preview email'));
  assert.ok(template.includes('escapeHtml'));
});

test('partner invitation uses shared branded template and verified sender', async () => {
  const invite = await readFile(invitePath, 'utf8');
  assert.ok(invite.includes('welcomeEmailHtml'));
  assert.ok(invite.includes('info@sunora.ae'));
  assert.ok(invite.includes('partner_code'));
  assert.ok(invite.includes('action_link'));
  assert.ok(!invite.includes('partners@sunora.ae'));
});

test('test endpoint only emails the signed-in admin and does not create accounts', async () => {
  const endpoint = await readFile(testEndpointPath, 'utf8');
  assert.ok(endpoint.includes('profile?.role!=="admin"'));
  assert.ok(endpoint.includes('user.user.email'));
  assert.ok(endpoint.includes('test:true'));
  assert.ok(!endpoint.includes('admin.createUser'));
  assert.ok(!endpoint.includes('partners.from'));
});

test('portal exposes welcome email test only to admins', async () => {
  const app = await readFile(appPath, 'utf8');
  assert.ok(app.includes("supabase.functions.invoke('welcome-email-test')"));
  assert.ok(app.includes('{isAdmin && ('));
  assert.ok(app.includes('Test welcome email'));
});
