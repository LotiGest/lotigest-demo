import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { backupLotigest } from './backup.mjs';
import { openStore } from './store.mjs';

test('respaldo de SQLite activo preserva datos y evita sobrescritura', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'lotigest-backup-'));
  const source = join(directory, 'active.sqlite');
  const destination = join(directory, 'backup.sqlite');
  const store = openStore(source);
  const actor = { name: 'gerente', role: 'admin' };
  try {
    store.addUser(actor.name, actor.role, 'a'.repeat(64));
    store.command(actor, 'lots', 'first', { id: 'L1', price_cents: 100 });
    await backupLotigest(source, destination);
    store.command(actor, 'lots', 'second', { id: 'L2', price_cents: 100 });
    await assert.rejects(backupLotigest(source, destination), /ya existe/);
    const restored = openStore(destination);
    try {
      assert.deepEqual(restored.read('lots').map(lot => lot.id), ['L1']);
      assert.equal(restored.commandStatus(actor, 'first').saved, true);
      assert.equal(restored.commandStatus(actor, 'second').saved, false);
    } finally {
      restored.close();
    }
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
