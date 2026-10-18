// Erzeugt bzw. aktualisiert das Android- oder iOS-Projekt aus www/ (vorher: node scripts/build-www.mjs).
// Die Projektordner android/ und ios/ werden nicht eingecheckt, sondern hier jedes Mal reproduzierbar erzeugt:
// Plattform hinzufügen, App-Symbole und Startbild erzeugen, Berechtigungstexte eintragen, Dateien kopieren.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.argv[2];
if (!['android', 'ios'].includes(platform)) throw new Error('Aufruf: node scripts/native.mjs android|ios');

const run = (...args) => execFileSync('npx', args, { cwd: root, stdio: 'inherit' });

if (!existsSync(join(root, platform))) run('cap', 'add', platform);
run('capacitor-assets', 'generate', `--${platform}`,
  '--iconBackgroundColor', '#2a78d6', '--iconBackgroundColorDark', '#1a4fa3',
  '--splashBackgroundColor', '#f4f4f1', '--splashBackgroundColorDark', '#111111');

if (platform === 'ios') {
  // iOS verlangt eine Begründung, bevor die App die Kamera nutzen darf (Fotos von Vokabelseiten)
  const plist = join(root, 'ios', 'App', 'App', 'Info.plist');
  let text = readFileSync(plist, 'utf8');
  const keys = {
    NSCameraUsageDescription: 'Damit du Vokabelseiten aus dem Buch oder Heft fotografieren und importieren kannst.',
    NSPhotoLibraryUsageDescription: 'Damit du Fotos von Vokabelseiten importieren kannst.',
  };
  for (const [key, value] of Object.entries(keys)) {
    if (!text.includes(`<key>${key}</key>`)) {
      text = text.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${key}</key>\n\t<string>${value}</string>\n</dict>\n</plist>\n`);
    }
  }
  writeFileSync(plist, text);
}

run('cap', 'sync', platform);
console.log(`${platform}-Projekt bereit:`, join(root, platform));
