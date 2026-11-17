import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio?version=2.0';
import Gtk from 'gi://Gtk?version=4.0';

export function addGeneralPreferences(page: Adw.PreferencesPage, settings: Gio.Settings): void {
    const group = new Adw.PreferencesGroup({ title: 'General' });
    page.add(group);

    const position = new Adw.ComboRow({
        title: 'Dock position',
        model: new Gtk.StringList({ strings: ['Bottom', 'Top', 'Left', 'Right'] }),
    });
    const positions = ['bottom', 'top', 'left', 'right'];
    position.selected = Math.max(0, positions.indexOf(settings.get_string('dock-position')));
    position.connect('notify::selected', () =>
        settings.set_string('dock-position', positions[position.selected]));
    settings.connect('changed::dock-position', () => {
        const selected = positions.indexOf(settings.get_string('dock-position'));
        if (selected >= 0)
            position.selected = selected;
    });
    group.add(position);

    addSwitch(group, settings, 'show-on-all-monitors', 'Show on all monitors');
    addSwitch(group, settings, 'auto-hide', 'Automatically hide the dock');
    addSwitch(group, settings, 'smart-hide', 'Hide when a window overlaps the dock');
    addSwitch(group, settings, 'show-window-previews', 'Show window previews on hover');
    addSwitch(group, settings, 'show-running-indicator', 'Show running application indicators');
    addSwitch(group, settings, 'show-window-count', 'Show window count badges');
}

function addSwitch(group: Adw.PreferencesGroup, settings: Gio.Settings, key: string, title: string): void {
    const row = new Adw.SwitchRow({ title });
    group.add(row);
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
}
