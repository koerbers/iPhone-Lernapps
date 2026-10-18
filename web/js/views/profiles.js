// Wer lernt? Auswahl des Kindes und Dialog zum Anlegen/Bearbeiten eines Profils.
import { LEVELS, levelForAge, levelOf } from '../level.js';
import { AVATARS, activeProfile, addProfile, profiles, switchProfile, updateProfile } from '../store.js';
import { esc, formDialog, onAction } from '../ui.js';

export function renderProfiles(root) {
  const active = activeProfile();
  root.innerHTML = `
    <a class="back" href="#/lernen">‹ Lernen</a>
    <h1>Wer lernt?</h1>
    <div class="profile-grid">
      ${profiles.list.map((p) => `
        <button class="profile-card ${p.id === active.id ? 'active' : ''}" data-action="pick" data-id="${p.id}">
          <span class="avatar big">${p.avatar}</span>
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
  const values = await formDialog(profile ? 'Profil bearbeiten' : 'Neues Kind', `
    <label class="field">Name <input name="name" required value="${esc(profile?.name ?? '')}" placeholder="z. B. Lia"></label>
    <label class="field">Alter
      <select name="age">
        <option value="">keine Angabe</option>
        ${Array.from({ length: 13 }, (_, i) => i + 6).map((a) => `<option value="${a}" ${Number(age) === a ? 'selected' : ''}>${a} Jahre</option>`).join('')}
      </select>
    </label>
    <div class="field">Bild
      <div class="avatar-picker">
        ${AVATARS.map((a) => `
          <label><input type="radio" name="avatar" value="${a}" ${(profile?.avatar ?? AVATARS[profiles.list.length % AVATARS.length]) === a ? 'checked' : ''}><span>${a}</span></label>`).join('')}
      </div>
    </div>
    <label class="field">Schwierigkeit
      <select name="difficulty">
        <option value="auto">Automatisch nach Alter</option>
        ${Object.values(LEVELS).map((l) => `<option value="${l.id}" ${profile?.difficulty === l.id ? 'selected' : ''}>${l.label} (${l.ages})</option>`).join('')}
      </select>
      <small class="muted">Automatisch: bis 10 Jahre leicht, 11–12 mittel, ab 13 schwer.</small>
    </label>`, profile ? 'Sichern' : 'Anlegen');
  if (!values?.name?.trim()) return null;
  const result = {
    name: values.name.trim(),
    age: values.age ? Number(values.age) : null,
    avatar: values.avatar || profile?.avatar || AVATARS[0],
    difficulty: values.difficulty || 'auto',
  };
  if (profile) updateProfile(profile.id, result);
  return result;
}

/** Kurze Beschreibung der wirksamen Stufe, z. B. „Leicht (automatisch, 9 Jahre)“ */
export function levelSummary(profile) {
  const level = levelOf(profile);
  if (profile.difficulty && profile.difficulty !== 'auto') return `${level.label} (von Hand gewählt)`;
  return profile.age ? `${level.label} (automatisch, ${profile.age} Jahre)` : `${LEVELS[levelForAge(null)].label} (kein Alter angegeben)`;
}
