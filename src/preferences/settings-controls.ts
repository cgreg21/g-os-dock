import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio?version=2.0';

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
