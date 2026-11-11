import { chmodSync, existsSync, linkSync, mkdtempSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { backup, DatabaseSync } from 'node:sqlite';

export async function backupLotigest(source, destination) {
  if (!source || !destination || !existsSync(source)) throw new Error('Selecciona una base existente y un destino nuevo.');
  const target = resolve(destination);
  if (existsSync(target)) throw new Error('El archivo de destino ya existe.');
  const folder = mkdtempSync(join(dirname(target), '.lotigest-backup-'));
  const temporary = join(folder, basename(target));
  try {
    const db = new DatabaseSync(source, { readOnly: true });
    try {
      await backup(db, temporary);
    } finally {
      db.close();
    }
    const copy = new DatabaseSync(temporary, { readOnly: true });
    try {
      const check = copy.prepare('PRAGMA integrity_check').all();
      const tables = copy.prepare("SELECT COUNT(*) AS total FROM sqlite_schema WHERE type='table' AND name IN ('lots','sales','payments')").get();
      if (check.length !== 1 || check[0].integrity_check !== 'ok' || tables.total !== 3) throw new Error('La copia no es una base válida de LOTIGEST.');
      if (copy.prepare('PRAGMA foreign_key_check').all().length) throw new Error('La copia contiene referencias inválidas.');
    } finally {
      copy.close();
    }
    chmodSync(temporary, 0o600);
    linkSync(temporary, target);
    return target;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await backupLotigest(process.env.LOTIGEST_DB, process.argv[2]));
}
