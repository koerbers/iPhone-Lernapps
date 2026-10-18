// Wer lernt? Auswahl des Kindes und Dialog zum Anlegen/Bearbeiten eines Profils.
import { LEVELS, levelForAge, levelOf } from '../level.js';
import { AVATARS, AVATAR_GROUPS, activeProfile, addProfile, avatarHtml, profiles, switchProfile, updateProfile } from '../store.js';
import { esc, formDialog, onAction } from '../ui.js';

export function renderProfiles(root) {
  const active = activeProfile();
  root.innerHTML = `
    <a class="back" href="#/lernen">‹ Lernen</a>
    <h1>Wer lernt?</h1>
    <div class="profile-grid">
      ${profiles.list.map((p) => `
        <button class="profile-card ${p.id === active.id ? 'active' : ''}" data-action="pick" data-id="${p.id}">
          ${avatarHtml(p, 'avatar big')}
          <strong>${esc(p.name)}</strong>
          <small class="muted">${p.age ? `${p.age} Jahre · ` : ''}${levelOf(p).label}</small>
        </button>`).join('')}
      <button class="profile-card add" data-action="add">
        <span class="avatar big">＋</span>
        <strong>Kind hinzufügen</strong>
      </button>
    </div>
    <p class="hint">Jedes Kind hat eigene Vokabellisten, einen eigenen Lernstand und eigene Einstellungen.
    Bearbeiten und Löschen unter <a href="#/einstellungen">Einstellungen</a>.</p>
  `;

  onAction(root, {
    pick: (el) => {
      if (el.dataset.id === active.id) location.hash = '#/lernen';
      else switchProfile(el.dataset.id);
    },
    add: async () => {
      const values = await profileDialog();
      if (values) switchProfile(addProfile(values).id);
    },
  });
}

/**
 * Dialog für Name, Alter, Avatar und Schwierigkeit.
 * Ohne `profile`: neues Kind; mit `profile`: bearbeiten (speichert direkt).
 */
export async function profileDialog(profile) {
  const age = profile?.age ?? '';
  const chosen = profile?.avatar ?? AVATARS[profiles.list.length % AVATARS.length];
  const values = await formDialog(profile ? 'Profil bearbeiten' : 'Neues Kind', `
    <label class="field">Name <input name="name" required value="${esc(profile?.name ?? '')}" placeholder="z. B. Lia"></label>
    <label class="field">Alter
      <select name="age">
        <option value="">keine Angabe</option>
        ${Array.from({ length: 13 }, (_, i) => i + 6).map((a) => `<option value="${a}" ${Number(age) === a ? 'selected' : ''}>${a} Jahre</option>`).join('')}
      </select>
    </label>
    <div class="field">Bild
      ${Object.entries(AVATAR_GROUPS).map(([group, emojis]) => `
        <small class="muted">${group}</small>
        <div class="avatar-picker">
          ${emojis.map((a) => `
            <label><input type="radio" name="avatar" value="${a}" ${!profile?.avatarImage && chosen === a ? 'checked' : ''}><span>${a}</span></label>`).join('')}
        </div>`).join('')}
      <small class="muted">Eigenes Bild</small>
      <div class="avatar-picker">
        ${profile?.avatarImage ? `
          <label><input type="radio" name="avatar" value="${IMAGE}" checked><span><img class="avatar-img" src="${profile.avatarImage}" alt="Eigenes Bild"></span></label>` : ''}
        <label class="avatar-upload"><input type="file" name="avatarFile" accept="image/*"
          onchange="this.closest('form').querySelectorAll('[name=avatar]').forEach((r) => (r.checked = false))"><span>📷</span></label>
      </div>
      <small class="muted">Ein Foto oder Bild vom Gerät, z. B. die Lieblingsfigur. Es bleibt nur auf diesem Gerät.</small>
    </div>
    <label class="field">Schwierigkeit
      <select name="difficulty">
        <option value="auto">Automatisch nach Alter</option>
        ${Object.values(LEVELS).map((l) => `<option value="${l.id}" ${profile?.difficulty === l.id ? 'selected' : ''}>${l.label} (${l.ages})</option>`).join('')}
      </select>
      <small class="muted">Automatisch: bis 10 Jahre leicht, 11–12 mittel, ab 13 schwer.</small>
    </label>`, profile ? 'Sichern' : 'Anlegen');
  if (!values?.name?.trim()) return null;
  const file = values.avatarFile?.size ? values.avatarFile : null;
  let avatarImage = values.avatar === IMAGE ? profile.avatarImage : null;
  if (file) {
    try {
      avatarImage = await squareThumbnail(file);
    } catch {
      alert('Das Bild konnte nicht gelesen werden.');
      avatarImage = profile?.avatarImage ?? null;
    }
  }
  const emoji = values.avatar && values.avatar !== IMAGE ? values.avatar : profile?.avatar;
  const result = {
    name: values.name.trim(),
    age: values.age ? Number(values.age) : null,
    avatar: emoji || chosen,
    avatarImage,
    difficulty: values.difficulty || 'auto',
  };
  if (profile) updateProfile(profile.id, result);
  return result;
}

const IMAGE = 'image';
const AVATAR_SIZE = 160;

/** Schneidet das Bild quadratisch aus der Mitte und verkleinert es (passt so gut in den Speicher). */
async function squareThumbnail(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = AVATAR_SIZE;
  canvas.getContext('2d').drawImage(
    bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE,
  );
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Kurze Beschreibung der wirksamen Stufe, z. B. „Leicht (automatisch, 9 Jahre)“ */
export function levelSummary(profile) {
  const level = levelOf(profile);
  if (profile.difficulty && profile.difficulty !== 'auto') return `${level.label} (von Hand gewählt)`;
  return profile.age ? `${level.label} (automatisch, ${profile.age} Jahre)` : `${LEVELS[levelForAge(null)].label} (kein Alter angegeben)`;
}
