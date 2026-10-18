// Baut den Inhalt der installierbaren App (Ordner www/) aus der Web-App (../web).
// Anders als im Browser kommen Texterkennung, PDF-Leser und Sprachdaten nicht vom CDN,
// sondern liegen mit im App-Paket (vendor/) – so funktioniert der Import auch offline.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, '..', 'web');
const www = join(root, 'www');
const modules = join(root, 'node_modules');

rmSync(www, { recursive: true, force: true });
cpSync(web, www, {
  recursive: true,
  // Tests und der Service Worker gehören nicht in die App (die App ist ohnehin offline verfügbar)
  filter: (src) => !src.includes(`${join(web, 'tests')}`) && !src.endsWith('sw.js'),
});

const vendor = [
  ['tesseract.js/dist/tesseract.min.js', 'tesseract/tesseract.min.js'],
  ['tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js'],
  // Nur die LSTM-Varianten: die App nutzt ausschließlich diesen Erkennungsmodus
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract/core/tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract/core/tesseract-core-simd-lstm.wasm.js'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'tesseract/lang/eng.traineddata.gz'],
  ['@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz', 'tesseract/lang/deu.traineddata.gz'],
  ['@tesseract.js-data/lat/4.0.0_best_int/lat.traineddata.gz', 'tesseract/lang/lat.traineddata.gz'],
  ['pdfjs-dist/build/pdf.min.mjs', 'pdfjs/pdf.min.mjs'],
  ['pdfjs-dist/build/pdf.worker.min.mjs', 'pdfjs/pdf.worker.min.mjs'],
];
for (const [from, to] of vendor) {
  const src = join(modules, from);
  if (!existsSync(src)) throw new Error(`Fehlt: ${from} – bitte zuerst „npm install“ im Ordner app/ ausführen`);
  const dest = join(www, 'vendor', to);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
}

// Gleiche Versionen wie im Browser (platform.js) – sonst verhält sich die App anders als die getestete Web-App
const ocr = readFileSync(join(web, 'js', 'platform.js'), 'utf8');
for (const [name, dir] of [['tesseract.js', 'tesseract.js'], ['pdfjs-dist', 'pdfjs-dist']]) {
  const version = JSON.parse(readFileSync(join(modules, dir, 'package.json'), 'utf8')).version;
  if (!ocr.includes(`${name}@${version}`)) throw new Error(`${name}: App nutzt ${version}, platform.js eine andere Version`);
}

// In der App gibt es keine Zugriffe auf das CDN mehr: Sicherheitsregeln entsprechend enger fassen
const indexPath = join(www, 'index.html');
const index = readFileSync(indexPath, 'utf8').replaceAll(' https://cdn.jsdelivr.net', '');
writeFileSync(indexPath, index);

console.log('App-Inhalt gebaut:', www);
