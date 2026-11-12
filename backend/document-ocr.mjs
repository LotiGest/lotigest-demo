import { spawn } from 'node:child_process';
import { HttpError } from './store.mjs';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export async function scanDocumentPage(request, { language = 'spa', tessdata } = {}) {
  if (request.headers['content-type'] !== 'image/png') throw new HttpError(415, 'La imagen debe estar en formato PNG.');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes <= 8 * 1024 * 1024) chunks.push(chunk);
  }
  if (bytes > 8 * 1024 * 1024) throw new HttpError(413, 'La imagen supera 8 MiB.');
  const image = Buffer.concat(chunks);
  if (image.length < 33 || !image.subarray(0, 8).equals(pngSignature) || image.readUInt32BE(8) !== 13 ||
      image.toString('ascii', 12, 16) !== 'IHDR') throw new HttpError(400, 'Imagen PNG inválida.');
  const width = image.readUInt32BE(16), height = image.readUInt32BE(20);
  if (!width || !height || width > 2400 || height > 2400) throw new HttpError(400, 'La imagen debe medir hasta 2400 píxeles por lado.');
  const args = ['stdin', 'stdout', '-l', language, '--psm', '6', ...(tessdata ? ['--tessdata-dir', tessdata] : [])];
  const text = await new Promise((resolve, reject) => {
    const child = spawn('tesseract', args, { stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, OMP_THREAD_LIMIT: '1' } });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new HttpError(504, 'El escaneo excedió el tiempo permitido.')); }, 20_000);
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > 30_000) { child.kill(); reject(new HttpError(422, 'La página contiene demasiado texto.')); }
    });
    child.stdin.on('error', () => {});
    child.once('error', () => { clearTimeout(timer); reject(new HttpError(503, 'OCR no disponible en el servidor.')); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code !== 0) reject(new HttpError(422, 'No fue posible leer la imagen. Verifica que esté completa y el OCR esté configurado.'));
      else resolve(output.trim());
    });
    child.stdin.end(image);
  });
  if (!text) throw new HttpError(422, 'No se detectó texto legible.');
  return { text };
}
