import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const templatePath = new URL('../supabase/functions/_shared/welcome-email.ts', import.meta.url);
const invitePath = new URL('../supabase/functions/partner-invite/index.ts', import.meta.url);
const appPath = new URL('../src/App.jsx', import.meta.url);

test('shared welcome email has SUNORA gold branding, partner details and escaping', async () => {
  const template = await readFile(templatePath, 'utf8');
  for (const phrase of ['SUNORA™','Channel Partner Program','Partner ID','Your Wellness Sun','escapeHtml','info@sunora.ae','#b58a45']) assert.ok(template.includes(phrase), `missing ${phrase}`);
  assert.ok(template.includes('test preview email'));
  assert.ok(template.includes('Set Your Password & Get Started'));
});

test('partner invitation reuses the template and uses the verified sender address', async () => {
  const invite = await readFile(invitePath, 'utf8');
  assert.ok(invite.includes('welcomeEmailHtml'));
  assert.ok(invite.includes('SUNORA Channel Partner Program <info@sunora.ae>'));
  assert.ok(invite.includes('partner.partner_code'));
  assert.ok(invite.includes('linkData.properties.action_link'));
  assert.ok(!invite.includes('partners@sunora.ae'));
});

test('test-send endpoint emails only the signed-in admin and avoids account creation', async () => {
  const endpoint = await readFile(testEndpointPath, 'utf8');
  assert.ok(/profile\?\.role\s*!==?\s*["']admin["']/.test(endpoint), 'test endpoint must restrict sends to admin role');
  assert.ok(endpoint.includes('user.user.email'));
  assert.ok(endpoint.includes('test: true'));
  assert.ok(!endpoint.includes('auth.admin.createUser'));
  assert.ok(!endpoint.includes('partners'));
});

test('admin portal has no welcome-email test action', async () => {
  const app = await readFile(appPath, 'utf8');
  assert.ok(!app.includes('Test welcome email'));
  assert.ok(!app.includes('sendWelcomeEmailTest'));
});

test('admin partner registration automatically sends the welcome/login invitation after creation', async () => {
  const app = await readFile(appPath, 'utf8');
  const registerStart = app.indexOf('async function addPartner(e)');
  const registerEnd = app.indexOf('\nasync function ', registerStart + 1);
  const registration = app.slice(registerStart, registerEnd > registerStart ? registerEnd : undefined);
  assert.ok(registration.includes(".from('partners')"));
  assert.ok(registration.includes(".insert(payload)"));
  assert.ok(registration.includes('if (isAdmin)'));
  assert.ok(registration.includes('await sendPartnerInvitation(data.id)'));
  assert.ok(registration.includes('flash(`Partner created and invitation sent: ${data.partner_code}`)'));
  assert.ok(registration.includes('An Admin must send the login invitation'));
});
