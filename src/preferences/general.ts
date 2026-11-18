import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio?version=2.0';
import Gdk from 'gi://Gdk?version=4.0';
import Gtk from 'gi://Gtk?version=4.0';

export function addGeneralPreferences(page: Adw.PreferencesPage, settings: Gio.Settings): void {
    const group = new Adw.PreferencesGroup({ title: 'Dock behavior' });
    page.add(group);
    const position = new Adw.ComboRow({
        title: 'Dock position',
        model: new Gtk.StringList({ strings: ['Bottom', 'Top', 'Left', 'Right'] }),
    });
    const positions = ['bottom', 'top', 'left', 'right'];
    position.selected = Math.max(0, positions.indexOf(settings.get_string('dock-position')));
    position.connect('notify::selected', () => {
        const value = positions[position.selected];
        if (value) settings.set_string('dock-position', value);
    });
    settings.connect('changed::dock-position', () => {
        const index = positions.indexOf(settings.get_string('dock-position'));
        if (index >= 0) position.selected = index;
    });
    group.add(position);
    addSwitch(group, settings, 'show-on-all-monitors', 'Show on all monitors');
    addSwitch(group, settings, 'auto-hide', 'Automatically hide the dock');
    addSwitch(group, settings, 'smart-hide', 'Hide when a window overlaps the dock');
    addSwitch(group, settings, 'show-window-previews', 'Show window previews on hover');
    addSwitch(group, settings, 'dev-mode', 'Enable development mode (red element borders)');
}

export function addItemPreferences(page: Adw.PreferencesPage, settings: Gio.Settings): void {
    const items = new Adw.PreferencesGroup({ title: 'Dock items' });
    page.add(items);
    addSwitch(items, settings, 'show-system-icon', 'Show applications and system icon');
    addIconThemeSelector(items, settings);
    addSwitch(items, settings, 'show-trash-icon', 'Show Trash in the dock');
    items.add(new Adw.ActionRow({ title: 'Dock item order', subtitle: 'Drag any icon to change its position. The order is saved automatically.' }));

    const drives = new Adw.PreferencesGroup({ title: 'Mounted drives' });
    page.add(drives);
    addSwitch(drives, settings, 'show-network-drives', 'Show network drives');
    addSwitch(drives, settings, 'show-system-drives', 'Show internal system drives');
    addSwitch(drives, settings, 'show-usb-drives', 'Show USB and removable drives');

    const separator = new Adw.PreferencesGroup({ title: 'Favorites separator' });
    page.add(separator);
    addSwitch(separator, settings, 'show-favorites-separator', 'Show separator between favorites and running apps');
    addSeparatorColorPicker(separator, settings);
    addSpin(separator, settings, 'favorites-separator-size', 'Thickness (px)', 1, 8);
    addSpin(separator, settings, 'favorites-separator-length', 'Length (px)', 1, 512);
}

export function addBehaviorPreferences(page: Adw.PreferencesPage, settings: Gio.Settings): void {
    const group = new Adw.PreferencesGroup({ title: 'Application behavior' });
    page.add(group);
    addSwitch(group, settings, 'show-running-indicator', 'Show running application indicators');
    addSwitch(group, settings, 'show-window-count', 'Show window count badges');
}

function addSwitch(group: Adw.PreferencesGroup, settings: Gio.Settings, key: string, title: string): void {
    const row = new Adw.SwitchRow({ title });
    group.add(row);
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
}

function addIconThemeSelector(group: Adw.PreferencesGroup, settings: Gio.Settings): void {
    const display = Gdk.Display.get_default();
    if (!display) return;
    const theme = Gtk.IconTheme.get_for_display(display);
    // Keep symbolic variants out of the picker: the launcher preview should
    // use the same regular application-icon style as the rest of the dock.
    const names = [...theme.get_icon_names()]
        .filter(name => !name.endsWith('-symbolic'))
        .sort((a, b) => a.localeCompare(b));
    if (names.length === 0) return;
    const fallback = names.includes('view-app-grid') ? 'view-app-grid' : (names[0] ?? 'view-app-grid');
    const row = new Adw.ComboRow({
        title: 'Applications icon',
        subtitle: 'Choose an icon from the current icon theme',
        model: new Gtk.StringList({ strings: names }),
        enable_search: true,
    });
    const factory = new Gtk.SignalListItemFactory();
    factory.connect('setup', (_factory, listItem) => {
        const item = listItem as Gtk.ListItem;
        const box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 });
        box.append(new Gtk.Image({ pixel_size: 22 }));
        box.append(new Gtk.Label({ xalign: 0, hexpand: true, ellipsize: 3 }));
        item.set_child(box);
    });
    factory.connect('bind', (_factory, listItem) => {
        const item = listItem as Gtk.ListItem;
        const model = item.get_item() as Gtk.StringObject | null;
        const box = item.get_child() as Gtk.Box | null;
        if (!model || !box) return;
        const image = box.get_first_child() as Gtk.Image | null;
        const label = image?.get_next_sibling() as Gtk.Label | null;
        if (!image || !label) return;
        image.set_from_icon_name(model.string);
        label.set_text(model.string);
    });
    row.factory = factory;
    row.list_factory = factory;
    const sync = () => {
        const index = names.indexOf(settings.get_string('system-icon-name'));
        row.selected = index >= 0 ? index : Math.max(0, names.indexOf(fallback));
    };
    row.connect('notify::selected', () => {
        const value = names[row.selected];
        if (value) settings.set_string('system-icon-name', value);
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
        if (!rgba.parse(settings.get_string('favorites-separator-color'))) rgba.parse('#ffffff');
        rgba.alpha = settings.get_double('favorites-separator-opacity');
        button.set_rgba(rgba);
        row.subtitle = settings.get_string('favorites-separator-color').toUpperCase();
    };
    button.connect('color-set', () => {
        const rgba = button.get_rgba();
        const hex = [rgba.red, rgba.green, rgba.blue].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
        settings.set_string('favorites-separator-color', `#${hex}`);
        settings.set_double('favorites-separator-opacity', rgba.alpha);
    });
    settings.connect('changed::favorites-separator-color', sync);
    settings.connect('changed::favorites-separator-opacity', sync);
    sync();
}

function addSpin(group: Adw.PreferencesGroup, settings: Gio.Settings, key: string, title: string, lower: number, upper: number): void {
    const row = new Adw.SpinRow({ title, adjustment: new Gtk.Adjustment({ lower, upper, step_increment: 1, page_increment: 5, value: settings.get_int(key) }) });
    group.add(row);
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
}
