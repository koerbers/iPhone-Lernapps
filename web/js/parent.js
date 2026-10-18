// Eltern-Code: schützt alles, was Lernstand oder Statistik löscht (Zurücksetzen, Listen/Vokabeln/Kinder löschen,
// Sicherung laden). Gespeichert wird nur ein Prüfwert (SHA-256 mit Zufallssalz), nicht der Code selbst.
import { profiles, saveProfiles } from './store.js';
import { esc, formDialog } from './ui.js';

const UNLOCK_MS = 5 * 60 * 1000; // nach richtiger Eingabe 5 Minuten lang nicht erneut fragen
const FREE_TRIES = 3;
let unlockedUntil = 0;

export const hasParentCode = () => Boolean(profiles.parentCode?.hash);

const CODE_FIELD = (name, label) => `
  <label class="field">${label}
    <input name="${name}" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8"
      autocomplete="off" required>
  </label>`;

async function digest(code, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${code}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSalt() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function storeCode(code) {
  const salt = randomSalt();
  profiles.parentCode = { salt, hash: await digest(code, salt) };
  profiles.parentLock = { fails: 0, until: 0 };
  saveProfiles();
}

/** Prüft den Code. Nach drei Fehlversuchen wird die Eingabe immer länger gesperrt (1, 2, 4 … Minuten). */
async function verify(code) {
  const lock = profiles.parentLock ?? { fails: 0, until: 0 };
  if (Date.now() < lock.until) {
    const minutes = Math.ceil((lock.until - Date.now()) / 60000);
    alert(`Zu viele falsche Versuche. Bitte in ${minutes} Minute${minutes === 1 ? '' : 'n'} noch einmal probieren.`);
    return false;
  }
  const ok = (await digest(code, profiles.parentCode.salt)) === profiles.parentCode.hash;
  if (ok) {
    profiles.parentLock = { fails: 0, until: 0 };
  } else {
    lock.fails += 1;
    if (lock.fails >= FREE_TRIES) lock.until = Date.now() + 60000 * 2 ** (lock.fails - FREE_TRIES);
    profiles.parentLock = lock;
    alert('Der Eltern-Code stimmt nicht.');
  }
  saveProfiles();
  return ok;
}

/** Neuen Code festlegen (zweimal eingeben). */
export async function setupParentCode(intro = '') {
  const values = await formDialog('Eltern-Code festlegen', `
    ${intro ? `<p>${esc(intro)}</p>` : ''}
    <p class="hint">4 bis 8 Ziffern. Nur wer den Code kennt, kann Lernstand und Statistik löschen.
    Gut merken – ohne Code geht das nur, indem man alle Daten der App löscht.</p>
    ${CODE_FIELD('code', 'Code')}
    ${CODE_FIELD('repeat', 'Code wiederholen')}`, 'Festlegen');
  if (!values) return false;
  if (!/^\d{4,8}$/.test(values.code)) {
    alert('Bitte 4 bis 8 Ziffern verwenden.');
    return false;
  }
  if (values.code !== values.repeat) {
    alert('Die beiden Eingaben sind verschieden.');
    return false;
  }
  await storeCode(values.code);
  unlockedUntil = Date.now() + UNLOCK_MS;
  return true;
}

/** Fragt nach dem Code (falls nötig). @returns {Promise<boolean>} true = erlaubt */
export async function requireParent(what) {
  if (Date.now() < unlockedUntil) return true;
  if (!hasParentCode()) return setupParentCode(`${what} ist nur mit Eltern-Code möglich. Bitte zuerst einen Code festlegen.`);
  const values = await formDialog('Eltern-Code', `
    <p>${esc(what)} – das dürfen nur Eltern.</p>
    ${CODE_FIELD('code', 'Eltern-Code')}`, 'OK');
  if (!values || !(await verify(values.code))) return false;
  unlockedUntil = Date.now() + UNLOCK_MS;
  return true;
}

/** Code ändern oder entfernen (nur mit dem bisherigen Code). */
export async function changeParentCode() {
  if (!(await requireParent('Den Eltern-Code ändern'))) return false;
  return setupParentCode();
}

export async function removeParentCode() {
  if (!(await requireParent('Den Eltern-Code entfernen'))) return false;
  delete profiles.parentCode;
  delete profiles.parentLock;
  saveProfiles();
  return true;
}

/** Schutz wieder aktivieren (z. B. wenn die Eltern fertig sind). */
export function lockParent() {
  unlockedUntil = 0;
}
