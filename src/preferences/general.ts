import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio?version=2.0';
import Gdk from 'gi://Gdk?version=4.0';
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
    position.connect('notify::selected', () => {
        const selectedPosition = positions[position.selected];
        if (selectedPosition)
            settings.set_string('dock-position', selectedPosition);
    });
    settings.connect('changed::dock-position', () => {
        const selected = positions.indexOf(settings.get_string('dock-position'));
        if (selected >= 0)
            position.selected = selected;
    });
    group.add(position);

    addSwitch(group, settings, 'show-system-icon', 'Show applications and system icon');
    const separator = new Adw.PreferencesGroup({ title: 'Favorites separator' });
    page.add(separator);
    addSwitch(separator, settings, 'show-favorites-separator', 'Show separator between favorites and running apps');
    addSeparatorColorPicker(separator, settings);
    addSpin(separator, settings, 'favorites-separator-size', 'Thickness (px)', 1, 8);
    addSpin(separator, settings, 'favorites-separator-length', 'Length (% of icon size)', 10, 100);
    addIconThemeSelector(group, settings);
    group.add(new Adw.ActionRow({
        title: 'Dock item order',
        subtitle: 'Drag any icon to change its position. The order is saved automatically.',
    }));
    addSwitch(group, settings, 'dev-mode', 'Enable development mode (red element borders)');
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

/** Select an icon by its name from the currently active GTK icon theme. */
function addIconThemeSelector(group: Adw.PreferencesGroup, settings: Gio.Settings): void {
    const display = Gdk.Display.get_default();
    if (!display)
        return;
    const theme = Gtk.IconTheme.get_for_display(display);
    const names = [...theme.get_icon_names()].sort((a, b) => a.localeCompare(b));
    const fallback = 'view-app-grid-symbolic';
    if (!names.includes(fallback))
        names.unshift(fallback);
    const row = new Adw.ComboRow({
        title: 'Applications icon',
        subtitle: 'Choose an icon from the current icon theme',
        model: new Gtk.StringList({ strings: names }),
    });
    const sync = () => {
        const index = names.indexOf(settings.get_string('system-icon-name'));
        row.selected = index >= 0 ? index : Math.max(0, names.indexOf(fallback));
    };
    row.connect('notify::selected', () => {
        const name = names[row.selected];
        if (name)
            settings.set_string('system-icon-name', name);
    });
    settings.connect('changed::system-icon-name', sync);
    group.add(row);
    sync();
}

function addSeparatorColorPicker(group: Adw.PreferencesGroup, settings: Gio.Settings): void {
    const row = new Adw.ActionRow({ title: 'Color and opacity' });
    const button = new Gtk.ColorButton({ use_alpha: true });
    button.valign = Gtk.Align.CENTER;
    button.tooltip_text = 'Choose separator color and opacity';
    row.add_suffix(button);
    group.add(row);

    const sync = () => {
        const rgba = new Gdk.RGBA();
        if (!rgba.parse(settings.get_string('favorites-separator-color')))
            rgba.parse('#ffffff');
        rgba.alpha = settings.get_double('favorites-separator-opacity');
        button.set_rgba(rgba);
        row.subtitle = settings.get_string('favorites-separator-color').toUpperCase();
    };
    button.connect('color-set', () => {
        const rgba = button.get_rgba();
        const hex = [rgba.red, rgba.green, rgba.blue]
            .map(channel => Math.round(channel * 255).toString(16).padStart(2, '0'))
            .join('');
        settings.set_string('favorites-separator-color', `#${hex}`);
        settings.set_double('favorites-separator-opacity', rgba.alpha);
    });
    settings.connect('changed::favorites-separator-color', sync);
    settings.connect('changed::favorites-separator-opacity', sync);
    sync();
}

function addSpin(
    group: Adw.PreferencesGroup,
    settings: Gio.Settings,
    key: string,
    title: string,
    lower: number,
    upper: number,
): void {
    const row = new Adw.SpinRow({
        title,
        adjustment: new Gtk.Adjustment({
            lower, upper, step_increment: 1, page_increment: 5,
            value: settings.get_int(key),
        }),
    });
    group.add(row);
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
}
