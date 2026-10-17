// Vokabeln aus Fotos, PDFs oder eingefügtem Text übernehmen.
import { extractVocabulary, isConfigured } from '../ai.js';
import { normalize } from '../answer.js';
import { fixOcrAccents, parse } from '../parser.js';
import { canvasToJpegBase64, pdfPagesAsCanvases, recognizeImage, recognizePdf, terminateOcr, toCanvas } from '../ocr.js';
import { addCard, addList, cardsOf, db, getList, save } from '../store.js';
import { SUBJECTS, SUBJECT_IDS } from '../subjects.js';
import { esc, onAction } from '../ui.js';

// Zustand der Import-Seite (bleibt erhalten, solange die App offen ist)
let imp = freshState();

function freshState(listId = '') {
  return { stage: 'pick', listId, newName: '', newSubject: 'english', message: '', pairs: [], notice: '', rawText: '', pasted: '' };
}

export function renderImport(root, listId) {
  if (listId && imp.listId !== listId && imp.stage === 'pick') imp.listId = listId;
  const draw = () => {
    root.innerHTML = imp.stage === 'busy' ? busyView() : imp.stage === 'review' ? reviewView() : pickView();
  };
  draw();

  root.onchange = async (event) => {
    const t = event.target;
    if (t.name === 'listId') {
      imp.listId = t.value;
      draw();
    }
    if (t.name === 'newSubject') imp.newSubject = t.value;
    if (t.name === 'useAI') {
      db.settings.useAI = t.checked;
      save();
    }
    if (t.name === 'files' && t.files.length) {
      await processFiles([...t.files], draw);
    }
  };

  root.oninput = (event) => {
    const t = event.target;
    if (t.name === 'newName') imp.newName = t.value;
    if (t.name === 'pasted') imp.pasted = t.value;
    if (t.dataset.field) imp.pairs[Number(t.dataset.row)][t.dataset.field] = t.value;
  };

  onAction(root, {
    paste: async () => {
      if (!imp.pasted.trim()) return;
      await processText(imp.pasted, draw);
    },
    toggleRow: (el) => {
      const pair = imp.pairs[Number(el.dataset.row)];
      pair.include = !pair.include;
      draw();
    },
    removeRow: (el) => {
      imp.pairs.splice(Number(el.dataset.row), 1);
      draw();
    },
    addRow: () => {
      imp.pairs.push({ term: '', translation: '', note: '', include: true });
      draw();
    },
    swap: () => {
      imp.pairs = imp.pairs.map((p) => ({ ...p, term: p.translation, translation: p.term }));
      draw();
    },
    back: () => {
      imp.stage = 'pick';
      draw();
    },
    save: () => {
      const list = saveImport();
      if (list) {
        imp = freshState();
        location.hash = `#/liste/${list.id}`;
      }
    },
  });
}

function targetSubject() {
  return getList(imp.listId)?.subject ?? imp.newSubject;
}

// ---------- Ansichten ----------

function pickView() {
  const target = getList(imp.listId);
  const ai = isConfigured();
  return `
    <a class="back" href="#/listen">‹ Vokabeln</a>
    <h1>📷 Vokabeln importieren</h1>

    <section class="card">
      <h3>Ziel-Liste</h3>
      <select name="listId" class="full">
        <option value="">Neue Liste …</option>
        ${SUBJECT_IDS.map((sid) => db.lists.filter((l) => l.subject === sid).map((l) => `
          <option value="${l.id}" ${l.id === imp.listId ? 'selected' : ''}>${SUBJECTS[sid].flag} ${esc(l.name)}</option>`).join('')).join('')}
      </select>
      ${target ? '' : `
        <label class="field">Name der neuen Liste <input name="newName" value="${esc(imp.newName)}" placeholder="z. B. Unit 3"></label>
        <div class="segmented">
          ${SUBJECT_IDS.map((s) => `
            <label><input type="radio" name="newSubject" value="${s}" ${imp.newSubject === s ? 'checked' : ''}><span>${SUBJECTS[s].flag} ${SUBJECTS[s].name}</span></label>`).join('')}
        </div>`}
    </section>

    <section class="card">
      <h3>Foto oder PDF</h3>
      <label class="btn primary large file-btn">
        📷 Foto aufnehmen / auswählen / PDF
        <input type="file" name="files" accept="image/*,application/pdf,.pdf" multiple>
      </label>
      <p class="hint">Am besten funktionieren Vokabellisten mit zwei Spalten (Fremdwort | Deutsch), gerade und gut beleuchtet fotografiert.
      Du kannst alles vor dem Speichern prüfen und korrigieren.</p>
    </section>

    <section class="card">
      <h3>Oder Text einfügen</h3>
      <textarea name="pasted" rows="5" placeholder="house – Haus&#10;to go – gehen">${esc(imp.pasted)}</textarea>
      <button class="btn" data-action="paste">Text übernehmen</button>
    </section>

    <section class="card">
      <label class="check-row">
        <input type="checkbox" name="useAI" ${db.settings.useAI ? 'checked' : ''} ${ai ? '' : 'disabled'}>
        <span>KI (Claude) zum Erkennen verwenden</span>
      </label>
      <p class="hint">${ai
        ? 'Claude liest die Seite direkt und ordnet Wörter und Übersetzungen auch bei unübersichtlichen Seiten richtig zu.'
        : 'Keine KI eingerichtet – es wird die Texterkennung auf dem Gerät verwendet (beim ersten Mal werden Sprachdaten geladen).'}</p>
    </section>`;
}

function busyView() {
  return `
    <h1>📷 Vokabeln importieren</h1>
    <section class="card center pad">
      <div class="spinner"></div>
      <p>${esc(imp.message || 'Bitte warten …')}</p>
    </section>`;
}

function reviewView() {
  const subject = SUBJECTS[targetSubject()];
  const included = imp.pairs.filter((p) => p.include).length;
  return `
    <button class="back link" data-action="back">‹ Zurück</button>
    <h1>Vokabeln prüfen</h1>
    ${imp.notice ? `<section class="card warn">${esc(imp.notice)}</section>` : ''}
    <p class="hint">Links steht ${subject.name}, rechts Deutsch. Falls es andersherum erkannt wurde: „Spalten tauschen“.
    Tippe auf ✓, um eine Zeile ab- oder anzuwählen.</p>
    <div class="row wrap">
      <button class="btn" data-action="swap">⇄ Spalten tauschen</button>
      <button class="btn" data-action="addRow">＋ Zeile</button>
    </div>
    <div class="review">
      ${imp.pairs.map((p, i) => `
        <div class="review-row ${p.include ? '' : 'off'}">
          <button class="icon-btn check ${p.include ? 'on' : ''}" data-action="toggleRow" data-row="${i}" aria-label="Zeile übernehmen">✓</button>
          <div class="grow">
            <input data-row="${i}" data-field="term" value="${esc(p.term)}" placeholder="${subject.name}" autocapitalize="off" autocorrect="off">
            <input data-row="${i}" data-field="translation" value="${esc(p.translation)}" placeholder="Deutsch">
            <input class="note-input" data-row="${i}" data-field="note" value="${esc(p.note)}" placeholder="Notiz (z. B. m, f, Adv.)">
          </div>
          <button class="icon-btn" data-action="removeRow" data-row="${i}" aria-label="Zeile löschen">🗑</button>
        </div>`).join('')}
    </div>
    ${imp.rawText ? `
      <details class="card">
        <summary>Erkannter Text anzeigen</summary>
        <pre class="raw">${esc(imp.rawText)}</pre>
      </details>` : ''}
    <button class="btn primary large sticky-bottom" data-action="save" ${included ? '' : 'disabled'}>${included} Vokabeln übernehmen</button>`;
}

// ---------- Verarbeitung ----------

async function processFiles(files, draw) {
  const subject = targetSubject();
  const useAI = db.settings.useAI && isConfigured();
  const languages = SUBJECTS[subject].ocrLang;
  const found = [];
  imp = { ...imp, stage: 'busy', notice: '', rawText: '' };

  const setMessage = (text) => {
    imp.message = text;
    draw();
  };

  for (const [i, file] of files.entries()) {
    const step = files.length > 1 ? ` (Datei ${i + 1}/${files.length})` : '';
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    try {
      if (useAI) {
        try {
          // Jede Seite einzeln als Bild an Claude schicken (auch bei großen PDFs zuverlässig)
          const images = isPdf ? await pdfPagesAsCanvases(file) : [await toCanvas(file, 1800)];
          for (const [p, canvas] of images.entries()) {
            const which = images.length > 1 ? `Seite ${p + 1} von ${images.length}` : 'die Vokabeln';
            setMessage(`Claude liest ${which} …${step}`);
            found.push(...(await extractVocabulary({ imageBase64: canvasToJpegBase64(canvas) }, subject)));
          }
          continue;
        } catch (e) {
          imp.notice = `Claude konnte nicht helfen (${e.message}). Es wurde die Texterkennung auf dem Gerät verwendet.`;
        }
      }
      setMessage(`Text wird erkannt …${step}`);
      const pages = isPdf
        ? await recognizePdf(file, languages, (m) => setMessage(m + step))
        : [await recognizeImage(await toCanvas(file), languages, (m) => setMessage(m + step))];
      for (const page of pages) {
        imp.rawText += (imp.rawText ? '\n\n' : '') + page.text;
        // Als Tabelle erkannt? Sonst Zeile für Zeile nach Trennzeichen suchen.
        found.push(...(page.pairs?.length >= 3 ? page.pairs : parse(page.text)).map(fixOcrAccents));
      }
    } catch (e) {
      imp.notice = e.message;
    }
  }
  await terminateOcr();
  finish(found, draw);
}

async function processText(text, draw) {
  const subject = targetSubject();
  imp = { ...imp, stage: 'busy', notice: '', rawText: '' };
  let found = parse(text);
  if (db.settings.useAI && isConfigured()) {
    imp.message = 'Claude sortiert die Vokabeln …';
    draw();
    try {
      found = await extractVocabulary({ text }, subject);
    } catch (e) {
      imp.notice = `Claude konnte nicht helfen (${e.message}). Es wurde die einfache Erkennung verwendet.`;
    }
  }
  finish(found, draw);
}

function finish(found, draw) {
  const seen = new Set();
  imp.pairs = found
    .filter((p) => p.term || p.translation)
    .filter((p) => {
      // doppelte Vokabeln nur einmal anzeigen
      const key = normalize(p.term ?? '');
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((p) => ({ term: p.term ?? '', translation: p.translation ?? '', note: p.note ?? '', include: true }));
  if (!imp.pairs.length) {
    imp.notice = `${imp.notice} Es wurden keine Vokabeln erkannt. Du kannst sie mit „＋ Zeile“ auch von Hand eintragen.`.trim();
  }
  imp.stage = 'review';
  draw();
}

function saveImport() {
  let list = getList(imp.listId);
  if (!list) {
    const name = imp.newName.trim() || `Import ${new Date().toLocaleDateString('de-DE')}`;
    list = addList(name, imp.newSubject);
  }
  const existing = new Set(cardsOf([list.id]).map((c) => normalize(c.term)));
  for (const pair of imp.pairs) {
    const term = pair.term.trim();
    const translation = pair.translation.trim();
    if (!pair.include || !term || !translation) continue;
    const key = normalize(term);
    if (existing.has(key)) continue; // doppelte Vokabeln überspringen
    existing.add(key);
    addCard(list.id, term, translation, pair.note);
  }
  save();
  return list;
}
