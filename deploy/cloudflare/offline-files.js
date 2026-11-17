const database=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('lotigest-offline-files',1);r.onupgradeneeded=()=>{r.result.createObjectStore('files');r.result.createObjectStore('outbox');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function fileTransaction(stores,mode,task){const db=await database();return new Promise((resolve,reject)=>{let result;const tx=db.transaction(stores,mode);try{const request=task(tx);if(request)request.onsuccess=()=>result=request.result;}catch(e){db.close();reject(e);return;}tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||Error('No se pudo conservar el documento en este equipo.'));};});}
window.lotigestFiles={
 async queue(key,file){await fileTransaction(['files','outbox'],'readwrite',tx=>{tx.objectStore('files').put(file,key);return tx.objectStore('outbox').put({key,file},key);});},
 get(key){return fileTransaction(['files'],'readonly',tx=>tx.objectStore('files').get(key));},
 pending(){return fileTransaction(['outbox'],'readonly',tx=>tx.objectStore('outbox').getAll());},
 complete(key){return fileTransaction(['outbox'],'readwrite',tx=>tx.objectStore('outbox').delete(key));},
 cache(key,file){return fileTransaction(['files'],'readwrite',tx=>tx.objectStore('files').put(file,key));}
};
