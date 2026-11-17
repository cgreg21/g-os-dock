import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';

/** Applies dock colors, spacing and translucent styling. */
export class DockAppearance {
    constructor(
        private actor: St.Widget,
        private settings: Gio.Settings,
        private desktopSettings: Gio.Settings,
    ) {}

    apply(): void {
        const acrylic = this.settings.get_boolean('acrylic-enabled');
        const opacity = this.settings.get_double('acrylic-opacity');
        const spacing = this.settings.get_int('dock-spacing');
        const theme = this.settings.get_string('theme');
        const colorScheme = this.desktopSettings.get_string('color-scheme');
        const dark = theme === 'dark' || (theme === 'system' && colorScheme !== 'prefer-light');
        const background = dark ? '32,35,45' : '246,247,250';
        const foreground = dark ? '255,255,255' : '30,32,38';

        const surface = acrylic
            ? `background-color: rgba(${background}, ${opacity}); border: 1px solid rgba(255,255,255,0.16); border-radius: 18px; padding: 8px;`
            : `background-color: rgba(${background},0.97); border-radius: 18px; padding: 8px;`;

        this.actor.set_style(`spacing: ${spacing}px; color: rgb(${foreground}); ${surface}`);
    }
}
