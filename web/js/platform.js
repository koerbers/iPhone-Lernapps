// Läuft die Web-App im Browser oder als installierte App (Capacitor, Android/iOS)?
// In der App liegen Texterkennung und PDF-Leser mit im Paket (Ordner vendor/, siehe app/scripts/build-www.mjs).

export const capacitor = globalThis.window?.Capacitor;
export const isNativeApp = Boolean(capacitor?.isNativePlatform?.());

/** Native Erweiterungen der App (nur in der App vorhanden, im Browser undefined). */
export const plugin = (name) => (isNativeApp ? capacitor.Plugins?.[name] : undefined);

const local = (path) => new URL(`vendor/${path}`, location.href).href;

export const LIBS = isNativeApp
  ? {
      tesseract: local('tesseract/tesseract.min.js'),
      tesseractOptions: {
        workerPath: local('tesseract/worker.min.js'),
        corePath: local('tesseract/core'),
        langPath: local('tesseract/lang'),
      },
      pdfjs: local('pdfjs/pdf.min.mjs'),
      pdfjsWorker: local('pdfjs/pdf.worker.min.mjs'),
    }
  : {
      tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
      tesseractOptions: {},
      pdfjs: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs',
      pdfjsWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs',
    };
