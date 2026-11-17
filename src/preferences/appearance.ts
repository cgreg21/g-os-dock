import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio?version=2.0';
import Gtk from 'gi://Gtk?version=4.0';

export function addAppearancePreferences(page: Adw.PreferencesPage, settings: Gio.Settings): void {
    const group = new Adw.PreferencesGroup({ title: 'Appearance' });
    page.add(group);

    addSwitch(group, settings, 'acrylic-enabled', 'Acrylic appearance');

    const iconSize = new Adw.SpinRow({
        title: 'Icon size',
        adjustment: new Gtk.Adjustment({
            lower: 24, upper: 96, step_increment: 4, page_increment: 8,
            value: settings.get_int('icon-size'),
        }),
    });
    group.add(iconSize);
    settings.bind('icon-size', iconSize, 'value', Gio.SettingsBindFlags.DEFAULT);

    const spacing = new Adw.SpinRow({
        title: 'Icon spacing',
        adjustment: new Gtk.Adjustment({
            lower: 0, upper: 24, step_increment: 1, page_increment: 2,
            value: settings.get_int('dock-spacing'),
        }),
    });
    group.add(spacing);
    settings.bind('dock-spacing', spacing, 'value', Gio.SettingsBindFlags.DEFAULT);

    const theme = new Adw.ComboRow({
        title: 'Dock theme',
        model: new Gtk.StringList({ strings: ['Dark', 'Light', 'System'] }),
    });
    const themes = ['dark', 'light', 'system'];
    theme.selected = Math.max(0, themes.indexOf(settings.get_string('theme')));
    theme.connect('notify::selected', () => {
        const selectedTheme = themes[theme.selected];
        if (selectedTheme)
            settings.set_string('theme', selectedTheme);
    });
    settings.connect('changed::theme', () => {
        const selected = themes.indexOf(settings.get_string('theme'));
        if (selected >= 0)
            theme.selected = selected;
    });
    group.add(theme);
}

function addSwitch(group: Adw.PreferencesGroup, settings: Gio.Settings, key: string, title: string): void {
    const row = new Adw.SwitchRow({ title });
    group.add(row);
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
}
