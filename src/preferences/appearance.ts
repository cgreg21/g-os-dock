import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio?version=2.0';
import Gtk from 'gi://Gtk?version=4.0';

export function addAppearancePreferences(page: Adw.PreferencesPage, settings: Gio.Settings): void {
    const base = new Adw.PreferencesGroup({ title: 'Appearance' });
    page.add(base);
    addSwitch(base, settings, 'acrylic-enabled', 'Enable translucent background');
    addEntry(base, settings, 'background-color', 'Background color (hex)');
    addSpin(base, settings, 'background-opacity', 'Background opacity', 0, 1, 0.05, true);
    addEntry(base, settings, 'border-color', 'Border color (hex)');
    addSpin(base, settings, 'border-opacity', 'Border opacity', 0, 1, 0.05, true);
    addSpin(base, settings, 'border-size', 'Border thickness', 0, 12, 1);
    addSpin(base, settings, 'edge-distance', 'Distance from screen edge', 0, 64, 1);

    const backgroundPadding = new Adw.PreferencesGroup({ title: 'Background padding' });
    page.add(backgroundPadding);
    for (const [key, title] of [
        ['background-padding-top', 'Top'],
        ['background-padding-right', 'Right'],
        ['background-padding-bottom', 'Bottom'],
        ['background-padding-left', 'Left'],
    ] as const)
        addSpin(backgroundPadding, settings, key, title, 0, 48, 1);

    const corners = new Adw.PreferencesGroup({ title: 'Corner radius' });
    page.add(corners);
    for (const [key, title] of [
        ['radius-top-left', 'Top left'],
        ['radius-top-right', 'Top right'],
        ['radius-bottom-right', 'Bottom right'],
        ['radius-bottom-left', 'Bottom left'],
    ] as const)
        addSpin(corners, settings, key, title, 0, 64, 1);

    const icons = new Adw.PreferencesGroup({ title: 'Icons' });
    page.add(icons);
    addSpin(icons, settings, 'icon-size', 'Icon size', 24, 96, 1);
    addSpin(icons, settings, 'dock-spacing', 'Space between icons', 0, 24, 1);
    for (const [key, title] of [
        ['icon-padding-top', 'Top padding'],
        ['icon-padding-right', 'Right padding'],
        ['icon-padding-bottom', 'Bottom padding'],
        ['icon-padding-left', 'Left padding'],
    ] as const)
        addSpin(icons, settings, key, title, 0, 24, 1);

    const indicators = new Adw.PreferencesGroup({ title: 'Running indicators' });
    page.add(indicators);
    addSwitch(indicators, settings, 'show-running-indicator', 'Enable indicators');
    addCombo(indicators, settings, 'indicator-mode', 'Indicator mode',
        ['Simple', 'Multiple'], ['simple', 'multiple']);
    addCombo(indicators, settings, 'indicator-shape', 'Indicator shape',
        ['Round', 'Square', 'Line'], ['round', 'square', 'line']);
    addEntry(indicators, settings, 'indicator-color', 'Indicator color (hex)');
    addSpin(indicators, settings, 'indicator-opacity', 'Indicator opacity', 0, 1, 0.05, true);
    addSwitch(indicators, settings, 'indicator-show-open', 'Show when application is open');
    addSwitch(indicators, settings, 'indicator-show-focused', 'Show when application is focused');
    addSwitch(indicators, settings, 'indicator-show-minimized', 'Show when all windows are minimized');

    const themeGroup = new Adw.PreferencesGroup({ title: 'Theme' });
    page.add(themeGroup);
    addCombo(themeGroup, settings, 'theme', 'Dock theme',
        ['Dark', 'Light', 'System'], ['dark', 'light', 'system']);
}

function addSpin(
    group: Adw.PreferencesGroup,
    settings: Gio.Settings,
    key: string,
    title: string,
    lower: number,
    upper: number,
    step: number,
    decimal = false,
): void {
    const row = new Adw.SpinRow({
        title,
        digits: decimal ? 2 : 0,
        adjustment: new Gtk.Adjustment({
            lower, upper, step_increment: step, page_increment: step * 2,
            value: decimal ? settings.get_double(key) : settings.get_int(key),
        }),
    });
    group.add(row);
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
}

function addEntry(group: Adw.PreferencesGroup, settings: Gio.Settings, key: string, title: string): void {
    const row = new Adw.EntryRow({ title });
    row.text = settings.get_string(key);
    row.connect('changed', () => settings.set_string(key, row.text));
    settings.connect(`changed::${key}`, () => {
        if (row.text !== settings.get_string(key))
            row.text = settings.get_string(key);
    });
    group.add(row);
}

function addSwitch(group: Adw.PreferencesGroup, settings: Gio.Settings, key: string, title: string): void {
    const row = new Adw.SwitchRow({ title });
    group.add(row);
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
}

function addCombo(
    group: Adw.PreferencesGroup,
    settings: Gio.Settings,
    key: string,
    title: string,
    labels: string[],
    values: string[],
): void {
    const row = new Adw.ComboRow({ title, model: new Gtk.StringList({ strings: labels }) });
    const sync = () => {
        const index = values.indexOf(settings.get_string(key));
        row.selected = index >= 0 ? index : 0;
    };
    sync();
    row.connect('notify::selected', () => {
        const value = values[row.selected];
        if (value)
            settings.set_string(key, value);
    });
    settings.connect(`changed::${key}`, sync);
    group.add(row);
}
