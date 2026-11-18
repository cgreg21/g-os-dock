import Adw from 'gi://Adw?version=1';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { addGeneralPreferences, addItemPreferences, addBehaviorPreferences } from './preferences/general.js';
import { addBackgroundPreferences, addIconPreferences, addIndicatorPreferences } from './preferences/appearance.js';

export default class GOSDockPreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        const settings = this.getSettings();
        const pages = [
            { title: 'General', icon: 'preferences-system-symbolic', build: addGeneralPreferences },
            { title: 'Dock items', icon: 'view-grid-symbolic', build: addItemPreferences },
            { title: 'Appearance', icon: 'applications-graphics-symbolic', build: addBackgroundPreferences },
            { title: 'Icons', icon: 'image-x-generic-symbolic', build: addIconPreferences },
            { title: 'Indicators', icon: 'media-record-symbolic', build: addIndicatorPreferences },
            { title: 'Behavior', icon: 'preferences-desktop-apps-symbolic', build: addBehaviorPreferences },
        ] as const;
        for (const entry of pages) {
            const page = new Adw.PreferencesPage({ title: entry.title, icon_name: entry.icon });
            window.add(page);
            entry.build(page, settings);
        }
    }
}
