import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const assets=JSON.parse(await readFile(new URL('./ocr-assets.json',import.meta.url),'utf8'));
export function validOcrAsset(bytes,asset){return bytes.length===asset.size&&createHash('sha256').update(bytes).digest('hex')===asset.sha256;}
export async function installOcrAssets(output,{fetcher=fetch}={}){
 await Promise.all(assets.map(async asset=>{
  const target=new URL('ocr/v5/'+asset.path,output);
  try{if(validOcrAsset(await readFile(target),asset))return;}catch{}
  const response=await fetcher(asset.url,{signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw Error('No se pudo preparar OCR: '+asset.path+' ('+response.status+')');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(!validOcrAsset(bytes,asset))throw Error('Recurso OCR incompleto o distinto: '+asset.path);
  await mkdir(new URL('.',target),{recursive:true});await writeFile(target,bytes);
 }));
}
