// Anbindung an Claude über die Anthropic-API (https://platform.claude.com).
// Der API-Schlüssel wird in den Einstellungen eingetragen und nur auf diesem Gerät gespeichert.
// Claude kann Fotos und PDFs direkt lesen, bildet Übungssätze und bewertet Übersetzungen.
import { db } from './store.js';
import { SUBJECTS, sourceLang, targetLang } from './subjects.js';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-5-5';

export function isConfigured() {
  return Boolean(db.settings.claudeKey);
}

// ---------- Anweisungen (Prompts) ----------

function extractionInstructions(subject) {
  const name = SUBJECTS[subject].name;
  let text = `Du hilfst einem Schulkind beim Anlegen von Vokabelkarten für das Fach ${name}.
Das Material ist ein Foto einer Vokabelliste: aus einem Schulbuch (oft eine Tabelle mit mehreren Spalten) oder
handschriftlich aus einem Vokabelheft (meist links ${name}, rechts Deutsch). Lies Handschrift sorgfältig Zeile für Zeile.
Spalten im Schulbuch:
Wort auf ${name} | Grammatikangaben | deutsche Bedeutung (darunter manchmal Beispielsätze) | Merkhilfen (Fremdwörter mit Flaggen, Verweise mit →).
Extrahiere alle Vokabeln dieser Seite:
- "term": das Wort oder der Ausdruck auf ${name}, genau so geschrieben wie im Buch (Makrons wie ā, ē dürfen bleiben).
- "translation": nur die deutsche Bedeutung. Mehrere Bedeutungen durch Komma trennen.
- "note": Grammatikangaben aus der eigenen Spalte, z. B. "m", "f", "n", "Adv.", "Präp. m. Akk.", "3. Pers. Sg." oder Stammformen. Sonst leer.
- Beispielsätze (ein Satz auf ${name}, darunter die deutsche Übersetzung) gehören NICHT zu den Vokabeln, sondern in "sentences":
  "prompt" ist der Satz auf ${name}, "solutions" die deutsche(n) Übersetzung(en) aus dem Buch (jede Variante einzeln).
- Ignoriere Merkhilfen, Überschriften, Seitenzahlen und Erklärtexte.
- Ignoriere blasse, durchscheinende Schrift von der Rückseite des Blattes.
- Korrigiere offensichtliche Lesefehler, erfinde aber keine Vokabeln.`;
  if (subject === 'english') {
    text += `
- Bei englischen Verben "to" mitschreiben, wenn es im Material steht. Unregelmäßige Formen ("go, went, gone") gehören zum "term".`;
  }
  return text;
}

function sentenceInstructions(subject, dir) {
  const source = sourceLang(subject, dir);
  const target = targetLang(subject, dir);
  let text = `Du bist eine freundliche Lehrkraft für ${SUBJECTS[subject].name} an einem deutschen Gymnasium (Klasse 5 bis 8).
Du erstellst kurze Übersetzungsübungen: Sätze auf ${source}, die das Kind ins ${target}e übersetzt.
- Jeder Satz verwendet mindestens eine der vorgegebenen Vokabeln.
- Sonst nur sehr einfache Grundwörter und Grammatik, die zu den Vokabeln passt.
- Sätze kurz (5 bis 12 Wörter), kindgerecht, abwechslungsreich und gern ein bisschen lustig.
- "prompt" ist der Satz auf ${source}, "solution" eine gute Musterübersetzung auf ${target}.`;
  if (subject === 'latin') {
    text += `
- Lateinische Sätze im Stil des Schulbuch-Lateins (z. B. wie in Cursus, Campus, Prima, Felix), ohne Makrons.`;
  }
  return text;
}

function gradingInstructions(subject, dir) {
  return `Du bist eine geduldige, ermutigende Lehrkraft für ${SUBJECTS[subject].name}.
Ein Kind hat einen Satz von ${sourceLang(subject, dir)} ins ${targetLang(subject, dir)}e übersetzt.
- "correct" ist true, wenn die Übersetzung inhaltlich und grammatisch im Wesentlichen stimmt. Freie, aber sinngemäß richtige Übersetzungen und Synonyme sind richtig. Kleine Rechtschreibfehler machen die Antwort nicht falsch, werden aber erwähnt.
- "feedback": 1 bis 3 kurze Sätze auf Deutsch, direkt an das Kind gerichtet (du). Erst loben, was gut war, dann konkret erklären, was falsch war (z. B. Vokabel, Zeitform, Fall).
- "correctedTranslation": die Übersetzung des Kindes, möglichst wenig verändert und richtiggestellt.`;
}

// ---------- Funktionen ----------

/**
 * Extrahiert Vokabelpaare und Beispielsätze.
 * @returns {Promise<{pairs: object[], sentences: {prompt: string, solutions: string[]}[]}>}
 * @param {{text?: string, imageBase64?: string}} material
 */
export async function extractVocabulary(material, subject) {
  const content = [];
  if (material.imageBase64) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: material.imageBase64 } });
  }
  let text = 'Extrahiere alle Vokabelpaare aus dem Material.';
  if (material.text) {
    text += `\n\nZur Hilfe der Text aus der automatischen Texterkennung (kann Fehler enthalten):\n${material.text}`;
  }
  content.push({ type: 'text', text });

  const result = await send({
    system: extractionInstructions(subject),
    content,
    effort: 'medium',
    schema: objectSchema({
      pairs: {
        type: 'array',
        items: objectSchema({ term: { type: 'string' }, translation: { type: 'string' }, note: { type: 'string' } }),
      },
      sentences: {
        type: 'array',
        items: objectSchema({ prompt: { type: 'string' }, solutions: { type: 'array', items: { type: 'string' } } }),
      },
    }),
  });
  return { pairs: result.pairs, sentences: result.sentences ?? [] };
}

/** @param {{term: string, translation: string}[]} words */
export async function makeSentences(words, subject, dir, count) {
  const list = words.map((w) => `- ${w.term} = ${w.translation}`).join('\n');
  const result = await send({
    system: sentenceInstructions(subject, dir),
    content: [{ type: 'text', text: `Erstelle ${count} Sätze. Verwende diese Vokabeln:\n${list}` }],
    effort: 'low',
    schema: objectSchema({
      sentences: { type: 'array', items: objectSchema({ prompt: { type: 'string' }, solution: { type: 'string' } }) },
    }),
  });
  return result.sentences;
}

export async function gradeTranslation(exercise, answer, subject, dir) {
  return send({
    system: gradingInstructions(subject, dir),
    content: [{
      type: 'text',
      text: `Satz: ${exercise.prompt}\nMusterlösung: ${exercise.solution}\nÜbersetzung des Kindes: ${answer}`,
    }],
    effort: 'low',
    schema: objectSchema({
      correct: { type: 'boolean' },
      feedback: { type: 'string' },
      correctedTranslation: { type: 'string' },
    }),
  });
}

// ---------- HTTP ----------

function objectSchema(properties) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

async function send({ system, content, schema, effort }) {
  if (!isConfigured()) {
    throw new Error('Kein Claude-API-Schlüssel eingetragen (Einstellungen).');
  }
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': db.settings.claudeKey,
      'anthropic-version': '2023-06-01',
      // Lehnt das Modell eine Anfrage ab, versucht die API es automatisch mit einem anderen Modell.
      'anthropic-beta': 'server-side-fallback-2026-07-01',
      // Erlaubt den Aufruf direkt aus dem Browser (der Schlüssel bleibt auf diesem Gerät).
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content }],
      output_config: { effort, format: { type: 'json_schema', schema } },
      fallbacks: 'default',
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw new Error('Der API-Schlüssel ist ungültig.');
    throw new Error(json.error?.message ?? `Fehler ${response.status}`);
  }
  if (json.stop_reason === 'refusal') throw new Error('Die KI hat diese Anfrage abgelehnt.');

  const text = json.content?.filter((b) => b.type === 'text').at(-1)?.text;
  if (!text) throw new Error('Die KI hat keine Antwort geliefert.');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Die Antwort der KI war unvollständig.');
  }
}
