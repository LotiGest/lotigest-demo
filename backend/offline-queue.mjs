// Se guardan referencias y montos. Las fichas y credenciales permanecen fuera de la cola.
export const offlineRoutes = new Set(['reservations', 'cancel-reservation', 'sales', 'payments', 'payment-batches']);

export function openOperationQueue() {
  const database = new Promise((resolve, reject) => {
    const request = indexedDB.open('lotigest-offline-v1', 1);
    request.onupgradeneeded = () => {
      const operations = request.result.createObjectStore('operations', { keyPath: 'sequence', autoIncrement: true });
      operations.createIndex('by-owner-fingerprint', ['owner', 'fingerprint'], { unique: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Cierra las otras pestañas de LOTIGEST e inténtalo de nuevo.'));
  });
  async function execute(mode, action) {
    const db = await database;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('operations', mode);
      const request = action(transaction.objectStore('operations'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? new Error('No se pudo guardar la operación en este equipo.'));
    });
  }
  return {
    async list(owner) {
      return (await execute('readonly', store => store.getAll())).filter(item => item.owner === owner);
    },
    async add(item) {
      const db = await database;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('operations', 'readwrite');
        const store = transaction.objectStore('operations');
        const lookup = store.index('by-owner-fingerprint').get([item.owner, item.fingerprint]);
        let saved;
        lookup.onsuccess = () => {
          if (lookup.result) saved = lookup.result;
          else {
            const insert = store.add(item);
            insert.onsuccess = () => { saved = { ...item, sequence: insert.result }; };
          }
        };
        transaction.oncomplete = () => resolve(saved);
        transaction.onabort = () => reject(transaction.error);
      });
    },
    update: item => execute('readwrite', store => store.put(item)),
    remove: sequence => execute('readwrite', store => store.delete(sequence)),
  };
}

export async function synchronizeQueue(queue, owner, send) {
  const confirmed = [];
  for (const item of await queue.list(owner)) {
    if (item.conflict) return { confirmed, conflict: item };
    try {
      const result = await send(item);
      await queue.remove(item.sequence);
      confirmed.push({ key: item.key, result });
    } catch (error) {
      if ([400, 403, 404, 409, 413, 415].includes(error.status)) {
        const conflict = { ...item, conflict: error.message };
        await queue.update(conflict);
        return { confirmed, conflict };
      }
      return { confirmed, waiting: true, sessionRequired: error.status === 401 };
    }
  }
  return { confirmed };
}
