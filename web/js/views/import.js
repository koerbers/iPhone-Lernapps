// Vokabeln aus Fotos, PDFs oder eingefügtem Text übernehmen.
// Ablauf: Quelle wählen → (Frage: Seiten Lektionen zuordnen?) → Erkennen → Prüfen → Speichern
import { extractVocabulary, isConfigured } from '../ai.js';
import { normalize } from '../answer.js';
import { fixOcrAccents, parse, parseText } from '../parser.js';
import {
  READABLE_QUALITY, canvasToJpegBase64, pdfPagesAsCanvases, pdfThumbnails, recognizeImage, recognizePdf, terminateOcr,
  toCanvas,
} from '../ocr.js';
import {
  addCard, addList, addSentence, cardsOf, cleanLesson, db, getList, lessonsOf, save, sentencesOf,
} from '../store.js';
import { SUBJECTS, SUBJECT_IDS } from '../subjects.js';
import { esc, onAction } from '../ui.js';

// Zustand der Import-Seite (bleibt erhalten, solange die App offen ist)
let imp = freshState();

function freshState(listId = '') {
  return {
    stage: 'pick', // pick | ask | assign | busy | review
    listId, newName: '', newSubject: 'english', message: '', pairs: [], notice: '', rawText: '', pasted: '', pasteLesson: '',
    sentences: [], // Beispielsätze: { prompt, solutions[], lesson, include }
    pageImages: [], // Seitenbilder (zum Nachsehen beim Prüfen)
    unreadable: 0, // Seiten, die die Texterkennung nicht lesen konnte (meist Handschrift)
    lessons: null, // gewählte Lektionen pro Seite (für „Mit Claude lesen“)
    files: [],
    units: [], // eine Einheit pro PDF-Seite bzw. Foto: { fileIndex, label, thumb, lesson, explicit }
  };
}

export function renderImport(root, listId) {
  if (listId && imp.listId !== listId && imp.stage === 'pick') imp.listId = listId;
  const views = { pick: pickView, ask: askView, assign: assignView, busy: busyView, review: reviewView };
  const draw = () => {
    root.innerHTML = (views[imp.stage] ?? pickView)();
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
      const files = [...t.files];
      // Textdateien (z. B. mit „house – Haus“ pro Zeile) direkt übernehmen
      if (files.every(isTextFile)) await processText((await Promise.all(files.map((f) => f.text()))).join('\n'), draw);
      else await prepareFiles(files.filter((f) => !isTextFile(f)), draw);
    }
    if (t.dataset.unit) setUnitLesson(root, Number(t.dataset.unit), t.value);
  };

  root.oninput = (event) => {
    const t = event.target;
    if (t.name === 'newName') imp.newName = t.value;
    if (t.name === 'pasted') imp.pasted = t.value;
    if (t.name === 'pasteLesson') imp.pasteLesson = t.value;
    if (t.dataset.field) imp.pairs[Number(t.dataset.row)][t.dataset.field] = t.value;
    if (t.dataset.sfield === 'prompt') imp.sentences[Number(t.dataset.srow)].prompt = t.value;
    if (t.dataset.sfield === 'solutions') {
      imp.sentences[Number(t.dataset.srow)].solutions = t.value.split(' / ').map((x) => x.trim()).filter(Boolean);
    }
  };

  onAction(root, {
    lessonsYes: () => {
      imp.stage = 'assign';
      draw();
    },
    lessonsNo: () => processFiles(imp.files, null, draw),
    startImport: () => processFiles(imp.files, imp.units.map((u) => u.lesson), draw),
    retryWithClaude: () => processFiles(imp.files, imp.lessons, draw, { forceAI: true }),
    paste: async () => {
      if (!imp.pasted.trim()) return;
      await processText(imp.pasted, draw);
    },
    toggleRow: (el) => {
      const pair = imp.pairs[Number(el.dataset.row)];
      pair.include = !pair.include;
      draw();
    },
    toggleSentence: (el) => {
      const sentence = imp.sentences[Number(el.dataset.srow)];
      sentence.include = !sentence.include;
      draw();
    },
    removeSentence: (el) => {
      imp.sentences.splice(Number(el.dataset.srow), 1);
      draw();
    },
    removeRow: (el) => {
      imp.pairs.splice(Number(el.dataset.row), 1);
      draw();
    },
    addRow: () => {
      imp.pairs.push({ term: '', translation: '', note: '', lesson: imp.pairs.at(-1)?.lesson ?? '', include: true });
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
    toAsk: () => {
      imp.stage = 'ask';
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
        <input type="file" name="files" accept="image/*,application/pdf,.pdf,text/plain,.txt" multiple>
      </label>
      <p class="hint">Am besten funktionieren gedruckte Vokabellisten, gerade und gut beleuchtet fotografiert.
      <strong>Handschrift</strong> liest nur die KI (Claude) zuverlässig – oder du nutzt die Texterkennung des iPhones
      (siehe „Text einfügen“). Du kannst alles vor dem Speichern prüfen und korrigieren.</p>
    </section>

    <section class="card">
      <h3>Oder Text einfügen</h3>
      <details class="hint">
        <summary>💡 Tipp für Handschrift: Texterkennung des iPhones</summary>
        <ol>
          <li>Die Seite in der <strong>Fotos</strong>-App öffnen (bei einer PDF: in <strong>Dateien</strong> öffnen).</li>
          <li>Auf ein Wort tippen und halten, dann <strong>„Alles auswählen“</strong> → <strong>„Kopieren“</strong>.</li>
          <li>Hier ins Feld tippen → <strong>„Einsetzen“</strong> → „Text übernehmen“.</li>
        </ol>
        Die App erkennt auch, wenn erst alle englischen und dann alle deutschen Wörter kommen.
      </details>
      <textarea name="pasted" rows="5" placeholder="house – Haus&#10;to go – gehen">${esc(imp.pasted)}</textarea>
      <label class="field">Lektion (optional)
        <input name="pasteLesson" value="${esc(imp.pasteLesson)}" placeholder="z. B. Lektion 3" ${lessonDatalistAttr()}>
      </label>
      ${lessonDatalist()}
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

/** Vorschlagsliste mit den Lektionen der Ziel-Liste */
function lessonDatalist() {
  const lessons = imp.listId ? lessonsOf(imp.listId).filter(Boolean) : [];
  return `<datalist id="import-lessons">${lessons.map((l) => `<option value="${esc(l)}">`).join('')}</datalist>`;
}

function lessonDatalistAttr() {
  return 'list="import-lessons" autocomplete="off"';
}

function askView() {
  const count = imp.units.length;
  return `
    <button class="back link" data-action="back">‹ Zurück</button>
    <h1>Lektionen zuordnen?</h1>
    <section class="card">
      <p>${count === 1 ? 'Die Seite' : `Die ${count} Seiten`} kannst du vor dem Import Lektionen zuordnen.
      Dann kannst du später gezielt einzelne Lektionen lernen.</p>
      <div class="thumb-strip">${imp.units.slice(0, 8).map((u) => `<img src="${u.thumb}" alt="">`).join('')}${count > 8 ? `<span class="muted">+${count - 8}</span>` : ''}</div>
      <button class="btn primary large" data-action="lessonsYes">📑 Ja, Seiten Lektionen zuordnen</button>
      <button class="btn large" data-action="lessonsNo">Nein, ohne Lektionen importieren</button>
    </section>`;
}

function assignView() {
  return `
    <button class="back link" data-action="toAsk">‹ Zurück</button>
    <h1>📑 Seiten → Lektionen</h1>
    <p class="hint">Trage bei der <strong>ersten Seite</strong> einer Lektion ihren Namen ein (z. B. „1“ oder „Lektion 1“) –
    die folgenden Seiten übernehmen ihn automatisch, bis du bei einer späteren Seite eine neue Lektion einträgst.</p>
    ${lessonDatalist()}
    <div class="pages">
      ${imp.units.map((u, i) => `
        <div class="page-row">
          <img src="${u.thumb}" alt="Seite ${i + 1}" loading="lazy">
          <label class="field grow">${esc(u.label)}
            <input data-unit="${i}" value="${esc(u.lesson)}" placeholder="Lektion" ${lessonDatalistAttr()}
              class="${u.explicit ? 'explicit' : ''}">
          </label>
        </div>`).join('')}
    </div>
    <button class="btn primary large sticky-bottom" data-action="startImport">▶︎ Import starten</button>`;
}

/** Lektion einer Seite setzen; folgende Seiten ohne eigene Angabe übernehmen sie. */
function setUnitLesson(root, index, value) {
  const lesson = cleanLesson(value);
  imp.units[index].lesson = lesson;
  imp.units[index].explicit = Boolean(lesson);
  for (let j = index + 1; j < imp.units.length && !imp.units[j].explicit; j++) {
    imp.units[j].lesson = lesson;
  }
  // Felder direkt aktualisieren (kein Neuzeichnen, damit die Tastatur offen bleibt)
  imp.units.forEach((u, j) => {
    const input = root.querySelector(`[data-unit="${j}"]`);
    if (input && document.activeElement !== input) input.value = u.lesson;
    input?.classList.toggle('explicit', u.explicit);
  });
  root.querySelector(`[data-unit="${index}"]`).value = lesson;
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
  const sentencesIncluded = imp.sentences.filter((x) => x.include).length;
  return `
    <button class="back link" data-action="back">‹ Zurück</button>
    <h1>Vokabeln prüfen</h1>
    ${imp.unreadable ? handwritingNotice() : ''}
    ${imp.notice ? `<section class="card warn">${esc(imp.notice)}</section>` : ''}
    ${imp.unreadable ? pageImagesSection(true) : ''}
    <p class="hint">Links steht ${subject.name}, rechts Deutsch. Falls es andersherum erkannt wurde: „Spalten tauschen“.
    Tippe auf ✓, um eine Zeile ab- oder anzuwählen.</p>
    <div class="row wrap">
      <button class="btn" data-action="swap">⇄ Spalten tauschen</button>
      <button class="btn" data-action="addRow">＋ Zeile</button>
    </div>
    <div class="review">
      ${lessonDatalist()}
      ${imp.pairs.map((p, i) => `
        ${p.lesson && p.lesson !== imp.pairs[i - 1]?.lesson ? `<h3 class="lesson-head">📑 ${esc(p.lesson)}</h3>` : ''}
        <div class="review-row ${p.include ? '' : 'off'}">
          <button class="icon-btn check ${p.include ? 'on' : ''}" data-action="toggleRow" data-row="${i}" aria-label="Zeile übernehmen">✓</button>
          <div class="grow">
            <input data-row="${i}" data-field="term" value="${esc(p.term)}" placeholder="${subject.name}" autocapitalize="off" autocorrect="off">
            <input data-row="${i}" data-field="translation" value="${esc(p.translation)}" placeholder="Deutsch">
            <div class="row tight">
              <input class="note-input" data-row="${i}" data-field="note" value="${esc(p.note)}" placeholder="Notiz (z. B. m, f, Adv.)">
              <input class="note-input lesson-input" data-row="${i}" data-field="lesson" value="${esc(p.lesson)}" placeholder="Lektion" ${lessonDatalistAttr()}>
            </div>
          </div>
          <button class="icon-btn" data-action="removeRow" data-row="${i}" aria-label="Zeile löschen">🗑</button>
        </div>`).join('')}
    </div>
    ${sentencesSection(subject)}
    ${imp.unreadable ? '' : pageImagesSection(false)}
    ${imp.rawText ? `
      <details class="card">
        <summary>Erkannter Text anzeigen</summary>
        <pre class="raw">${esc(imp.rawText)}</pre>
      </details>` : ''}
    <button class="btn primary large sticky-bottom" data-action="save" ${included || sentencesIncluded ? '' : 'disabled'}>
      ${included} Vokabeln${sentencesIncluded ? ` + ${sentencesIncluded} Sätze` : ''} übernehmen
    </button>`;
}

/** Die Texterkennung konnte (einige) Seiten nicht lesen – meist Handschrift. */
function handwritingNotice() {
  const ai = isConfigured();
  return `
    <section class="card warn">
      <h3>✍️ Handschrift erkannt?</h3>
      <p>${imp.unreadable === 1 ? 'Eine Seite' : `${imp.unreadable} Seiten`} konnte die Texterkennung auf dem Gerät nicht lesen.
      Sie ist für gedruckte Schrift gemacht – Handschrift kann sie kaum lesen.</p>
      ${ai
        ? '<button class="btn primary large" data-action="retryWithClaude">🤖 Mit Claude lesen</button><p class="small">Claude liest auch Handschrift zuverlässig (ca. 1–2 Cent pro Seite).</p>'
        : `<p><strong>Zwei Möglichkeiten:</strong></p>
           <ol>
             <li><strong>Claude</strong> liest Handschrift zuverlässig (ca. 1–2 Cent pro Seite).
               Dafür in den <a href="#/einstellungen">Einstellungen</a> einen API-Schlüssel eintragen und den Import wiederholen.</li>
             <li><strong>Kostenlos mit dem iPhone:</strong> Seite in Fotos/Dateien öffnen, Text gedrückt halten →
               „Alles auswählen“ → „Kopieren“ und unter „Vokabeln importieren → Text einfügen“ einsetzen.</li>
           </ol>`}
      <p class="small">Oder unten mit „＋ Zeile“ abtippen – die Seiten siehst du hier zum Nachsehen.</p>
    </section>`;
}

/** Seitenbilder zum Nachsehen beim Prüfen und Abtippen */
function pageImagesSection(open) {
  if (!imp.pageImages.length) return '';
  return `
    <details class="card" ${open ? 'open' : ''}>
      <summary>📄 Seiten anzeigen (${imp.pageImages.length})</summary>
      <div class="page-images">${imp.pageImages.map((src, i) => `<img src="${src}" alt="Seite ${i + 1}" loading="lazy">`).join('')}</div>
    </details>`;
}

/** Gefundene Beispielsätze (werden als Übungssätze für „Sätze übersetzen“ gespeichert). */
function sentencesSection(subject) {
  if (!imp.sentences.length) return '';
  const included = imp.sentences.filter((x) => x.include).length;
  return `
    <h2 class="section-title">📝 Beispielsätze (${included} von ${imp.sentences.length})</h2>
    <p class="hint">Diese Sätze aus dem Buch werden als Übungssätze gespeichert (Lernen → Sätze übersetzen → „Sätze aus dem Buch“).
    Oben ${subject.name}, darunter die Übersetzung – mehrere Übersetzungen mit „ / “ trennen.</p>
    <div class="review">
      ${imp.sentences.map((x, i) => `
        ${x.lesson && x.lesson !== imp.sentences[i - 1]?.lesson ? `<h3 class="lesson-head">📑 ${esc(x.lesson)}</h3>` : ''}
        <div class="review-row ${x.include ? '' : 'off'}">
          <button class="icon-btn check ${x.include ? 'on' : ''}" data-action="toggleSentence" data-srow="${i}" aria-label="Satz übernehmen">✓</button>
          <div class="grow">
            <input data-srow="${i}" data-sfield="prompt" value="${esc(x.prompt)}" placeholder="${subject.name}" autocapitalize="off" autocorrect="off">
            <input data-srow="${i}" data-sfield="solutions" value="${esc(x.solutions.join(' / '))}" placeholder="Deutsch">
          </div>
          <button class="icon-btn" data-action="removeSentence" data-srow="${i}" aria-label="Satz löschen">🗑</button>
        </div>`).join('')}
    </div>`;
}

// ---------- Verarbeitung ----------

/** Nach der Dateiauswahl: Vorschaubilder erzeugen und fragen, ob Lektionen zugeordnet werden sollen. */
async function prepareFiles(files, draw) {
  imp = { ...imp, files, units: [], stage: 'busy', message: 'Seiten werden vorbereitet …', notice: '' };
  draw();
  try {
    for (const [fileIndex, file] of files.entries()) {
      const prefix = files.length > 1 ? `Datei ${fileIndex + 1}, ` : '';
      if (isPdf(file)) {
        const thumbs = await pdfThumbnails(file);
        thumbs.forEach((thumb, p) => imp.units.push({ fileIndex, label: `${prefix}Seite ${p + 1}`, thumb, lesson: '', explicit: false }));
      } else {
        const thumb = (await toCanvas(file, 360)).toDataURL('image/jpeg', 0.7);
        imp.units.push({ fileIndex, label: files.length > 1 ? `Foto ${fileIndex + 1}` : 'Foto', thumb, lesson: '', explicit: false });
      }
    }
    imp.stage = 'ask';
    draw();
  } catch (e) {
    // Vorschau nicht möglich (z. B. offline) → ohne Lektionen weiter
    imp.notice = `Vorschau nicht möglich (${e.message}).`;
    await processFiles(files, null, draw);
  }
}

function isTextFile(file) {
  return file.type === 'text/plain' || /\.txt$/i.test(file.name);
}

function isPdf(file) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/**
 * Erkennt die Vokabeln aller Dateien.
 * @param {string[] | null} lessons Lektion pro Seite/Foto (in der Reihenfolge von imp.units) oder null
 */
async function processFiles(files, lessons, draw, { forceAI = false } = {}) {
  const subject = targetSubject();
  const useAI = (forceAI || db.settings.useAI) && isConfigured();
  const languages = SUBJECTS[subject].ocrLang;
  const found = [];
  const foundSentences = [];
  imp = { ...imp, stage: 'busy', rawText: '', pageImages: [], unreadable: 0, lessons, notice: forceAI ? '' : imp.notice };

  const setMessage = (text) => {
    imp.message = text;
    draw();
  };
  // Lektion für Seite `page` von Datei `fileIndex`
  const lessonFor = (fileIndex, page) => {
    if (!lessons) return '';
    const first = imp.units.findIndex((u) => u.fileIndex === fileIndex);
    return lessons[first + page] ?? '';
  };

  for (const [i, file] of files.entries()) {
    const step = files.length > 1 ? ` (Datei ${i + 1}/${files.length})` : '';
    try {
      if (useAI) {
        try {
          // Jede Seite einzeln als Bild an Claude schicken (auch bei großen PDFs zuverlässig)
          const images = isPdf(file) ? await pdfPagesAsCanvases(file) : [await toCanvas(file, 1800)];
          for (const [p, canvas] of images.entries()) {
            const which = images.length > 1 ? `Seite ${p + 1} von ${images.length}` : 'die Vokabeln';
            setMessage(`Claude liest ${which} …${step}`);
            const result = await extractVocabulary({ imageBase64: canvasToJpegBase64(canvas) }, subject);
            found.push(...result.pairs.map((pair) => ({ ...pair, lesson: lessonFor(i, p) })));
            foundSentences.push(...result.sentences.map((x) => ({ ...x, lesson: lessonFor(i, p) })));
          }
          continue;
        } catch (e) {
          imp.notice = `Claude konnte nicht helfen (${e.message}). Es wurde die Texterkennung auf dem Gerät verwendet.`;
        }
      }
      setMessage(`Text wird erkannt …${step}`);
      const pages = isPdf(file)
        ? await recognizePdf(file, languages, (m) => setMessage(m + step))
        : [await recognizeImage(await toCanvas(file), languages, (m) => setMessage(m + step))];
      pages.forEach((page, p) => {
        imp.rawText += (imp.rawText ? '\n\n' : '') + page.text;
        if (page.image) imp.pageImages.push(page.image);
        if (page.quality < READABLE_QUALITY) {
          // Nicht lesbar (meist Handschrift): lieber nichts anbieten als Unsinn
          imp.unreadable += 1;
          return;
        }
        // Als Tabelle erkannt? Sonst Zeile für Zeile nach Trennzeichen suchen.
        const pairs = page.pairs?.length >= 3 ? page.pairs : parse(page.text);
        found.push(...pairs.map(fixOcrAccents).map((pair) => ({ ...pair, lesson: lessonFor(i, p) })));
        foundSentences.push(...(page.sentences ?? []).map(fixSentenceAccents).map((x) => ({ ...x, lesson: lessonFor(i, p) })));
      });
    } catch (e) {
      imp.notice = e.message;
    }
  }
  await terminateOcr();
  finish(found, draw, foundSentences);
}

/** Akzent-Lesefehler auch in Beispielsätzen korrigieren (siehe fixOcrAccents). */
function fixSentenceAccents(sentence) {
  return {
    prompt: fixOcrAccents({ term: sentence.prompt, translation: '' }).term,
    solutions: sentence.solutions.map((t) => fixOcrAccents({ term: '', translation: t }).translation),
  };
}

async function processText(text, draw) {
  const subject = targetSubject();
  imp = { ...imp, stage: 'busy', notice: '', rawText: '', pageImages: [], unreadable: 0 };
  const lesson = cleanLesson(imp.pasteLesson);
  let found = parseText(text);
  let sentences = [];
  if (db.settings.useAI && isConfigured()) {
    imp.message = 'Claude sortiert die Vokabeln …';
    draw();
    try {
      ({ pairs: found, sentences } = await extractVocabulary({ text }, subject));
    } catch (e) {
      imp.notice = `Claude konnte nicht helfen (${e.message}). Es wurde die einfache Erkennung verwendet.`;
    }
  }
  finish(found.map((pair) => ({ ...pair, lesson })), draw, sentences.map((x) => ({ ...x, lesson })));
}

function finish(found, draw, sentences = []) {
  const seenSentences = new Set();
  imp.sentences = sentences
    .filter((x) => x.prompt && x.solutions?.length)
    .filter((x) => {
      const key = normalize(x.prompt);
      if (seenSentences.has(key)) return false;
      seenSentences.add(key);
      return true;
    })
    .map((x) => ({ prompt: x.prompt, solutions: x.solutions, lesson: x.lesson ?? '', include: true }));
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
    .map((p) => ({ term: p.term ?? '', translation: p.translation ?? '', note: p.note ?? '', lesson: p.lesson ?? '', include: true }));
  if (!imp.pairs.length && !imp.sentences.length && !imp.unreadable) {
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
  const existing = new Map(cardsOf([list.id]).map((c) => [normalize(c.term), c]));
  for (const pair of imp.pairs) {
    const term = pair.term.trim();
    const translation = pair.translation.trim();
    if (!pair.include || !term || !translation) continue;
    const key = normalize(term);
    const lesson = cleanLesson(pair.lesson);
    const known = existing.get(key);
    if (known) {
      // Schon vorhanden: nichts doppelt anlegen, aber fehlende Lektion nachtragen (Lernstand bleibt erhalten)
      if (lesson && !known.lesson) known.lesson = lesson;
      continue;
    }
    existing.set(key, addCard(list.id, term, translation, pair.note, lesson));
  }

  // Beispielsätze
  const knownSentences = new Map(sentencesOf([list.id]).map((x) => [normalize(x.prompt), x]));
  for (const x of imp.sentences) {
    const prompt = x.prompt.trim();
    const solutions = x.solutions.map((t) => t.trim()).filter(Boolean);
    if (!x.include || !prompt || !solutions.length) continue;
    const lesson = cleanLesson(x.lesson);
    const known = knownSentences.get(normalize(prompt));
    if (known) {
      if (lesson && !known.lesson) known.lesson = lesson;
      continue;
    }
    knownSentences.set(normalize(prompt), addSentence(list.id, prompt, solutions, lesson));
  }
  save();
  return list;
}
