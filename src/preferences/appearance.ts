import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio?version=2.0';
import Gtk from 'gi://Gtk?version=4.0';
import { addColorPicker } from './color-picker.js';
import { addSwitch } from './settings-controls.js';

export function addBackgroundPreferences(page: Adw.PreferencesPage, settings: Gio.Settings): void {
    const base = new Adw.PreferencesGroup({ title: 'Background and border' });
    page.add(base);
    addSwitch(base, settings, 'acrylic-enabled', 'Enable translucent background');
    addColorPicker(base, settings, 'background-color', 'background-opacity', 'Background color');
    addColorPicker(base, settings, 'border-color', 'border-opacity', 'Border color');
    addSpin(base, settings, 'border-size', 'Border thickness', 0, 12, 1);
    addSpin(base, settings, 'edge-distance', 'Distance from screen edge', 0, 64, 1);

    const shadow = new Adw.PreferencesGroup({ title: 'Background shadow' });
    page.add(shadow);
    addSwitch(shadow, settings, 'background-shadow-enabled', 'Enable background shadow');
    addColorPicker(shadow, settings, 'background-shadow-color', 'background-shadow-opacity', 'Shadow color');
    addSpin(shadow, settings, 'background-shadow-offset-x', 'Horizontal offset (px)', -32, 32, 1);
    addSpin(shadow, settings, 'background-shadow-offset-y', 'Vertical offset (px)', -32, 32, 1);
    addSpin(shadow, settings, 'background-shadow-blur', 'Blur radius (px)', 0, 64, 1);
    addSpin(shadow, settings, 'background-shadow-spread', 'Spread radius (px)', -16, 32, 1);

    const padding = new Adw.PreferencesGroup({ title: 'Background padding' });
    page.add(padding);
    for (const [key, title] of [['background-padding-top', 'Top'], ['background-padding-right', 'Right'], ['background-padding-bottom', 'Bottom'], ['background-padding-left', 'Left']] as const)
        addSpin(padding, settings, key, title, 0, 48, 1);

    const corners = new Adw.PreferencesGroup({ title: 'Corner radius' });
    page.add(corners);
    for (const [key, title] of [['radius-top-left', 'Top left'], ['radius-top-right', 'Top right'], ['radius-bottom-right', 'Bottom right'], ['radius-bottom-left', 'Bottom left']] as const)
        addSpin(corners, settings, key, title, 0, 64, 1);

    const theme = new Adw.PreferencesGroup({ title: 'Theme' });
    page.add(theme);
    addCombo(theme, settings, 'theme', 'Dock theme', ['Dark', 'Light', 'System'], ['dark', 'light', 'system']);
}

export function addIconPreferences(page: Adw.PreferencesPage, settings: Gio.Settings): void {
    const icons = new Adw.PreferencesGroup({ title: 'Icons and spacing' });
    page.add(icons);
    addSpin(icons, settings, 'icon-size', 'Icon size', 24, 96, 1);
    addSpin(icons, settings, 'dock-spacing', 'Space between icons', 0, 24, 1);
    for (const [key, title] of [['icon-padding-top', 'Top padding'], ['icon-padding-right', 'Right padding'], ['icon-padding-bottom', 'Bottom padding'], ['icon-padding-left', 'Left padding']] as const)
        addSpin(icons, settings, key, title, 0, 24, 1);
}

export function addIndicatorPreferences(page: Adw.PreferencesPage, settings: Gio.Settings): void {
    const group = new Adw.PreferencesGroup({ title: 'Running indicators' });
    page.add(group);
    addSwitch(group, settings, 'show-running-indicator', 'Enable indicators');
    addCombo(group, settings, 'indicator-mode', 'Indicator mode', ['Simple', 'Multiple'], ['simple', 'multiple']);
    addCombo(group, settings, 'indicator-shape', 'Indicator shape', ['Round', 'Square', 'Line'], ['round', 'square', 'line']);
    addColorPicker(group, settings, 'indicator-color', 'indicator-opacity', 'Indicator color');
    addSpin(group, settings, 'indicator-size', 'Indicator size (px)', 1, 16, 1);
    addSpin(group, settings, 'indicator-border-size', 'Indicator border thickness (px)', 0, 8, 1);
    addColorPicker(group, settings, 'indicator-border-color', 'indicator-border-opacity', 'Indicator border color');
    addSpin(group, settings, 'indicator-bottom-offset', 'Distance from icon bottom (px)', -32, 32, 1);
    addSwitch(group, settings, 'indicator-show-open', 'Show when application is open');
    addSwitch(group, settings, 'indicator-show-focused', 'Show when application is focused');
    addSwitch(group, settings, 'indicator-show-minimized', 'Show when all windows are minimized');
}

function addSpin(group: Adw.PreferencesGroup, settings: Gio.Settings, key: string, title: string, lower: number, upper: number, step: number): void {
    const row = new Adw.SpinRow({ title, adjustment: new Gtk.Adjustment({ lower, upper, step_increment: step, page_increment: step * 2, value: settings.get_int(key) }) });
    group.add(row);
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
}
function addCombo(group: Adw.PreferencesGroup, settings: Gio.Settings, key: string, title: string, labels: string[], values: string[]): void {
    const row = new Adw.ComboRow({ title, model: new Gtk.StringList({ strings: labels }) });
    const sync = () => { const index = values.indexOf(settings.get_string(key)); row.selected = index >= 0 ? index : 0; };
    sync();
    row.connect('notify::selected', () => { const value = values[row.selected]; if (value) settings.set_string(key, value); });
    settings.connect(`changed::${key}`, sync);
    group.add(row);
}
