import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio?version=2.0';
import Gtk from 'gi://Gtk?version=4.0';

/** Add a color control that keeps its color and opacity settings synchronized. */
export function addColorPicker(
    group: Adw.PreferencesGroup,
    settings: Gio.Settings,
    colorKey: string,
    opacityKey: string,
    title: string,
): void {
    const row = new Adw.ActionRow({ title });
    const button = new Gtk.ColorButton({ use_alpha: true });
    button.valign = Gtk.Align.CENTER;
    button.tooltip_text = 'Choose color and opacity';
    row.add_suffix(button);
    group.add(row);

    const sync = () => {
        const rgba = new Gdk.RGBA();
        const color = settings.get_string(colorKey);
        if (!rgba.parse(color))
            rgba.parse('#ffffff');
        rgba.alpha = settings.get_double(opacityKey);
        button.set_rgba(rgba);
        row.subtitle = color.toUpperCase();
    };

    button.connect('color-set', () => {
        const rgba = button.get_rgba();
        const hex = [rgba.red, rgba.green, rgba.blue]
            .map(value => Math.round(value * 255).toString(16).padStart(2, '0'))
            .join('');
        settings.set_string(colorKey, `#${hex}`);
        settings.set_double(opacityKey, rgba.alpha);
    });
    settings.connect(`changed::${colorKey}`, sync);
    settings.connect(`changed::${opacityKey}`, sync);
    sync();
}
