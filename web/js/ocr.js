// Texterkennung im Browser:
// - Fotos: Tesseract.js (läuft auf dem Gerät, lädt beim ersten Mal die Sprachdaten)
// - PDFs: pdf.js liest die Textebene; eingescannte/fotografierte Seiten werden per Texterkennung gelesen.
// Ergebnis ist der erkannte Text (zum Anzeigen) und – wenn die Seite wie eine Vokabeltabelle
// aussieht – direkt die Vokabelpaare (siehe layout.js).
import { tableToContent } from './layout.js';
import { LIBS } from './platform.js';

/** Zielgröße (längste Seite in Pixeln) für die Texterkennung */
const OCR_SIZE = 2200;

/**
 * Unter dieser Sicherheit (Median, 0–100) ist die Seite praktisch nicht lesbar – meist Handschrift.
 * Gemessen: gedruckte Schulbuchseite ≈ 95, handgeschriebenes Vokabelheft ≈ 40.
 */
export const READABLE_QUALITY = 70;

// So lange darf das Laden der Texterkennung samt Sprachdaten höchstens dauern (langsames Mobilfunknetz)
const START_TIMEOUT_MS = 180_000;

let tesseractLoading;
function loadTesseract() {
  tesseractLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = LIBS.tesseract;
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => {
      tesseractLoading = null;
      reject(new Error('Texterkennung konnte nicht geladen werden (Internet?)'));
    };
    document.head.append(script);
  });
  return tesseractLoading;
}

let pdfjsLoading;
function loadPdfJs() {
  pdfjsLoading ??= import(LIBS.pdfjs).then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = LIBS.pdfjsWorker;
    return pdfjs;
  });
  return pdfjsLoading;
}

// Die Texterkennung wird für alle Seiten eines Imports wiederverwendet (Laden dauert).
let worker = null;
let workerLanguages = '';
let progressListener = null;

async function getWorker(languages) {
  if (worker && workerLanguages === languages) return worker;
  await terminateOcr();
  const Tesseract = await loadTesseract();
  progressListener?.('Sprachdaten werden geladen …');
  let failed;
  const failure = new Promise((_, reject) => (failed = reject));
  const starting = Tesseract.createWorker(languages, 1, {
    ...LIBS.tesseractOptions,
    logger: (m) => {
      if (m.status === 'recognizing text') progressListener?.(`Text wird erkannt … ${Math.round(m.progress * 100)} %`);
    },
    // Fehler im Hintergrund-Worker sonst nur als „Script error“ ohne Ende des Ladens
    errorHandler: (e) => failed(new Error(`Die Texterkennung ist abgestürzt (${e?.message ?? e}).`)),
  });
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Die Texterkennung startet nicht. Bitte Internetverbindung prüfen und noch einmal versuchen.')), START_TIMEOUT_MS));
  try {
    worker = await Promise.race([starting, failure, timeout]);
  } catch (e) {
    starting.then((w) => w.terminate()).catch(() => {});
    throw e;
  }
  workerLanguages = languages;
  return worker;
}

/** Gibt den Speicher der Texterkennung frei (nach dem Import aufrufen). */
export async function terminateOcr() {
  const w = worker;
  worker = null;
  workerLanguages = '';
  await w?.terminate();
}

/** Zeichnet ein Bild (Datei oder Canvas) verkleinert auf ein neues Canvas. */
export async function toCanvas(source, maxDimension = OCR_SIZE) {
  const bitmap = source instanceof HTMLCanvasElement ? source : await createImageBitmap(source);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Macht das Bild schwarz-weiß. Die Schwelle richtet sich nach der Helligkeit der Umgebung,
 * so verschwinden durchscheinende Schrift von der Rückseite, Schatten und graue Tabellenlinien.
 */
export function cleanUpImage(canvas) {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;

  // Helligkeit und Summentabelle (für schnelle Mittelwerte über ein Fenster)
  const lum = new Float32Array(w * h);
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      lum[y * w + x] = l;
      rowSum += l;
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + rowSum;
    }
  }

  const r = Math.max(15, Math.round(Math.max(w, h) / 40));
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const area = (y1 - y0) * (x1 - x0);
      const mean = (sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0]) / area;
      const v = lum[y * w + x] < mean * 0.72 ? 0 : 255;
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Erkennt Text in einem Bild. `languages` z. B. "eng+deu" oder "lat+deu".
 * @returns {Promise<{text: string, pairs: object[] | null, sentences: object[], quality: number, image: string}>}
 *   quality = wie sicher sich die Texterkennung ist (0–100), image = Vorschaubild der Seite
 */
export async function recognizeImage(canvas, languages, onProgress) {
  progressListener = onProgress;
  const image = (await toCanvas(canvas, 1200)).toDataURL('image/jpeg', 0.7);
  const w = await getWorker(languages);
  const { data } = await w.recognize(cleanUpImage(canvas));
  const words = (data.words ?? []).map((word) => ({
    text: word.text,
    confidence: word.confidence,
    x0: word.bbox.x0,
    x1: word.bbox.x1,
    y0: word.bbox.y0,
    y1: word.bbox.y1,
  }));
  const content = tableToContent(words, canvas.width);
  const confidences = words.filter((x) => /\p{L}/u.test(x.text)).map((x) => x.confidence).sort((a, b) => a - b);
  return {
    text: words.length ? wordsToLines(words) : data.text,
    pairs: content?.pairs ?? null,
    sentences: content?.sentences ?? [],
    quality: confidences.length ? confidences[Math.floor(confidences.length / 2)] : 0,
    image,
  };
}

/**
 * Liest eine PDF-Datei Seite für Seite.
 * @returns {Promise<{text: string, pairs: object[] | null, sentences: object[], quality: number, image?: string}[]>}
 *   ein Eintrag pro Seite
 */
export async function recognizePdf(file, languages, onProgress) {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const step = `Seite ${i} von ${pdf.numPages}`;
    onProgress?.(`${step} …`);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const width = page.getViewport({ scale: 1 }).width;
    const words = content.items
      .filter((item) => item.str?.trim())
      .map((item) => {
        const x = item.transform[4];
        const y = item.transform[5];
        const h = item.height || Math.abs(item.transform[3]) || 10;
        // PDF-Koordinaten: Ursprung unten → y umdrehen
        return { text: item.str.trim(), x0: x, x1: x + item.width, y0: -y - h, y1: -y };
      });
    const text = words.length ? wordsToLines(words) : '';
    if (text.replace(/\s/g, '').length > 30) {
      const content = tableToContent(words, width);
      pages.push({ text, pairs: content?.pairs ?? null, sentences: content?.sentences ?? [], quality: 100 });
    } else {
      // Eingescannte/fotografierte Seite → als Bild erkennen
      const canvas = await renderPdfPage(page);
      pages.push(await recognizeImage(canvas, languages, (m) => onProgress?.(`${step}: ${m}`)));
    }
  }
  return pages;
}

/** Zeichnet eine PDF-Seite als Bild (für die Texterkennung oder die KI). */
export async function renderPdfPage(page, maxDimension = OCR_SIZE) {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: maxDimension / Math.max(base.width, base.height) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas;
}

/** Kleine Vorschaubilder aller Seiten einer PDF (für die Zuordnung zu Lektionen). */
export async function pdfThumbnails(file, maxDimension = 360) {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  const thumbs = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const canvas = await renderPdfPage(await pdf.getPage(i), maxDimension);
    thumbs.push(canvas.toDataURL('image/jpeg', 0.7));
  }
  return thumbs;
}

/** Alle Seiten einer PDF als Bilder (für die KI). */
export async function pdfPagesAsCanvases(file, maxDimension = 1600) {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  const canvases = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    canvases.push(await renderPdfPage(await pdf.getPage(i), maxDimension));
  }
  return canvases;
}

/**
 * Fasst Wörter zu Zeilen zusammen (nach ihrer Höhe auf der Seite) und
 * trennt Spalten mit Tabulator – für die Anzeige „Erkannter Text“ und als Rückfall.
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

export function canvasToJpegBase64(canvas) {
  return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
}
