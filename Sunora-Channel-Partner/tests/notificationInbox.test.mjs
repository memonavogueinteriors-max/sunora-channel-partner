import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appPath = new URL('../src/App.jsx', import.meta.url);

test('notification inbox is visible to signed-in partners and uses read-marker-only updates', async () => {
  const app = await readFile(appPath, 'utf8');
  assert.ok(app.includes("...(profile ? [{ name: 'Notifications', icon: Bell }] : [])"));
  assert.ok(app.includes("{tab === 'Notifications' && profile && ("));
  const start = app.indexOf('async function markNotificationRead(id)');
  const end = app.indexOf('function exportCsv()', start);
  assert.ok(start >= 0 && end > start, 'notification read handler should exist');
  const handler = app.slice(start, end);
  assert.ok(handler.includes('if (!session) return;'));
  assert.ok(handler.includes(".update({ read_at: readAt })"));
  assert.ok(!handler.includes("if (!isAdmin) return;"));
});
