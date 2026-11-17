import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class GOSDockPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window: any): void {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({ title: 'G-OS Dock', icon_name: 'dock-symbolic' });
        window.add(page);
        const general = new Adw.PreferencesGroup({ title: 'General' });
        page.add(general);
        const position = new Adw.ComboRow({ title: 'Dock position', model: new Gtk.StringList({ strings: ['Bottom', 'Top', 'Left', 'Right'] }) });
        general.add(position);
        const positions = ['bottom', 'top', 'left', 'right'];
        position.selected = Math.max(0, positions.indexOf(settings.get_string('dock-position')));
        position.connect('notify::selected', () => settings.set_string('dock-position', positions[position.selected]));
        settings.connect('changed::dock-position', () => {
            const selected = positions.indexOf(settings.get_string('dock-position'));
            if (selected >= 0) position.selected = selected;
        });
        const allMonitors = new Adw.SwitchRow({ title: 'Show on all monitors' });
        general.add(allMonitors);
        settings.bind('show-on-all-monitors', allMonitors, 'active', Gio.SettingsBindFlags.DEFAULT);
        const autoHide = new Adw.SwitchRow({ title: 'Automatically hide the dock' });
        general.add(autoHide);
        settings.bind('auto-hide', autoHide, 'active', Gio.SettingsBindFlags.DEFAULT);
        const windowPreviews = new Adw.SwitchRow({ title: 'Show window previews on hover' });
        general.add(windowPreviews);
        settings.bind('show-window-previews', windowPreviews, 'active', Gio.SettingsBindFlags.DEFAULT);
        const runningIndicator = new Adw.SwitchRow({ title: 'Show running application indicators' });
        general.add(runningIndicator);
        settings.bind('show-running-indicator', runningIndicator, 'active', Gio.SettingsBindFlags.DEFAULT);
        const windowCount = new Adw.SwitchRow({ title: 'Show window count badges' });
        general.add(windowCount);
        settings.bind('show-window-count', windowCount, 'active', Gio.SettingsBindFlags.DEFAULT);
        const smartHide = new Adw.SwitchRow({ title: 'Hide when a window overlaps the dock' });
        general.add(smartHide);
        settings.bind('smart-hide', smartHide, 'active', Gio.SettingsBindFlags.DEFAULT);
        const appearance = new Adw.PreferencesGroup({ title: 'Appearance' });
        page.add(appearance);
        const acrylic = new Adw.SwitchRow({ title: 'Acrylic appearance' });
        appearance.add(acrylic);
        settings.bind('acrylic-enabled', acrylic, 'active', Gio.SettingsBindFlags.DEFAULT);
        const iconSize = new Adw.SpinRow({ title: 'Icon size', adjustment: new Adw.Adjustment({ lower: 24, upper: 96, step_increment: 4, page_increment: 8, value: settings.get_int('icon-size') }) });
        appearance.add(iconSize);
        settings.bind('icon-size', iconSize, 'value', Gio.SettingsBindFlags.DEFAULT);
        const spacing = new Adw.SpinRow({ title: 'Icon spacing', adjustment: new Adw.Adjustment({ lower: 0, upper: 24, step_increment: 1, page_increment: 2, value: settings.get_int('dock-spacing') }) });
        appearance.add(spacing);
        settings.bind('dock-spacing', spacing, 'value', Gio.SettingsBindFlags.DEFAULT);
        const theme = new Adw.ComboRow({ title: 'Dock theme', model: new Gtk.StringList({ strings: ['Dark', 'Light', 'System'] }) });
        appearance.add(theme);
        const themes = ['dark', 'light', 'system'];
        theme.selected = Math.max(0, themes.indexOf(settings.get_string('theme')));
        theme.connect('notify::selected', () => settings.set_string('theme', themes[theme.selected]));
        settings.connect('changed::theme', () => {
            const selected = themes.indexOf(settings.get_string('theme'));
            if (selected >= 0) theme.selected = selected;
        });
    }
}
