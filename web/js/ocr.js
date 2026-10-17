// Texterkennung im Browser:
// - Fotos: Tesseract.js (läuft auf dem Gerät, lädt beim ersten Mal die Sprachdaten)
// - PDFs: pdf.js liest die Textebene; eingescannte Seiten werden per Texterkennung gelesen.
// Nebeneinanderliegende Wörter mit großem Abstand (Spalten einer Vokabelliste)
// werden mit Tabulator getrennt, damit die Erkennung Wort und Übersetzung findet.

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';

let tesseractLoading;
function loadTesseract() {
  tesseractLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TESSERACT_URL;
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error('Texterkennung konnte nicht geladen werden (Internet?)'));
    document.head.append(script);
  });
  return tesseractLoading;
}

let pdfjsLoading;
async function loadPdfJs() {
  pdfjsLoading ??= import(PDFJS_URL).then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    return pdfjs;
  });
  return pdfjsLoading;
}

/** Verkleinert ein Bild (Datei oder Canvas) auf eine sinnvolle Größe. */
export async function toCanvas(source, maxDimension = 2000) {
  const bitmap = source instanceof HTMLCanvasElement ? source : await createImageBitmap(source);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Erkennt Text in einem Bild. `languages` z. B. "eng+deu" oder "lat+deu". */
export async function recognizeImage(canvas, languages, onProgress) {
  const Tesseract = await loadTesseract();
  const worker = await Tesseract.createWorker(languages, 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress?.(`Text wird erkannt … ${Math.round(m.progress * 100)} %`);
      else if (m.status?.includes('loading')) onProgress?.('Sprachdaten werden geladen …');
    },
  });
  try {
    const { data } = await worker.recognize(canvas);
    const words = (data.words ?? []).map((w) => ({
      text: w.text,
      x0: w.bbox.x0,
      x1: w.bbox.x1,
      y0: w.bbox.y0,
      y1: w.bbox.y1,
    }));
    return words.length ? wordsToLines(words) : data.text;
  } finally {
    await worker.terminate();
  }
}

/** Liest den Text einer PDF-Datei. */
export async function recognizePdf(file, languages, onProgress) {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.(`PDF-Seite ${i} von ${pdf.numPages} …`);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const words = content.items
      .filter((item) => item.str?.trim())
      .map((item) => {
        const x = item.transform[4];
        const y = item.transform[5];
        const h = item.height || Math.abs(item.transform[3]) || 10;
        // PDF-Koordinaten: Ursprung unten → y umdrehen
        return { text: item.str, x0: x, x1: x + item.width, y0: -y - h, y1: -y };
      });
    const text = words.length ? wordsToLines(words) : '';
    if (text.replace(/\s/g, '').length > 30) {
      pages.push(text);
    } else {
      // Eingescannte Seite ohne Text → als Bild erkennen
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      pages.push(await recognizeImage(await toCanvas(canvas), languages, onProgress));
    }
  }
  return pages.join('\n');
}

/**
 * Fasst Wörter zu Zeilen zusammen (nach ihrer Höhe auf der Seite) und
 * trennt Spalten mit Tabulator.
 */
export function wordsToLines(words) {
  const sorted = [...words].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const rows = [];
  for (const w of sorted) {
    const mid = (w.y0 + w.y1) / 2;
    const row = rows.at(-1);
    if (row) {
      const ref = row[0];
      const refMid = (ref.y0 + ref.y1) / 2;
      const height = Math.max(ref.y1 - ref.y0, w.y1 - w.y0);
      if (Math.abs(refMid - mid) < height * 0.6) {
        row.push(w);
        continue;
      }
    }
    rows.push([w]);
  }

  return rows
    .map((row) => {
      row.sort((a, b) => a.x0 - b.x0);
      const height = Math.max(...row.map((w) => w.y1 - w.y0), 1);
      let line = '';
      row.forEach((w, i) => {
        if (i > 0) {
          const gap = w.x0 - row[i - 1].x1;
          line += gap > height * 1.5 ? '\t' : ' ';
        }
        line += w.text;
      });
      return line.trim();
    })
    .filter(Boolean)
    .join('\n');
}

/** Datei → Base64 (ohne „data:…;base64,“). */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function canvasToJpegBase64(canvas) {
  return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
}
