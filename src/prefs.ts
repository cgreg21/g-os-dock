import Adw from 'gi://Adw?version=1';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { addGeneralPreferences } from './preferences/general.js';
import { addAppearancePreferences } from './preferences/appearance.js';

export default class GOSDockPreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        const page = new Adw.PreferencesPage({
            title: 'G-OS Dock',
            icon_name: 'dock-symbolic',
        });
        window.add(page);

        const settings = this.getSettings();
        addGeneralPreferences(page, settings);
        addAppearancePreferences(page, settings);
    }
}
