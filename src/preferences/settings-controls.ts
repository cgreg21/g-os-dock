import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio?version=2.0';
import Gtk from 'gi://Gtk?version=4.0';

/** Add a switch row bound directly to a boolean GSettings key. */
export function addSwitch(
    group: Adw.PreferencesGroup,
    settings: Gio.Settings,
    key: string,
    title: string,
): void {
    const row = new Adw.SwitchRow({ title });
    group.add(row);
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
}

/** Add an integer spin row bound directly to a GSettings key. */
export function addSpin(
    group: Adw.PreferencesGroup,
    settings: Gio.Settings,
    key: string,
    title: string,
    lower: number,
    upper: number,
    step = 1,
    pageIncrement = 5,
): void {
    const row = new Adw.SpinRow({
        title,
        adjustment: new Gtk.Adjustment({
            lower,
            upper,
            step_increment: step,
            page_increment: pageIncrement,
            value: settings.get_int(key),
        }),
    });
    group.add(row);
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
}
