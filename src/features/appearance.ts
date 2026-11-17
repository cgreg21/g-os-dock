import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';

/** Applies the user-configurable dock surface and spacing. */
export class DockAppearance {
    constructor(
        private background: St.Widget,
        private actor: St.Widget,
        private content: St.BoxLayout,
        private settings: Gio.Settings,
        private desktopSettings: Gio.Settings,
    ) {}

    apply(): void {
        const theme = this.settings.get_string('theme');
        const colorScheme = this.desktopSettings.get_string('color-scheme');
        const dark = theme === 'dark' || (theme === 'system' && colorScheme !== 'prefer-light');
        const defaultBackground = dark ? '#20232d' : '#f6f7fa';
        const defaultForeground = dark ? '#ffffff' : '#1e2026';
        const acrylic = this.settings.get_boolean('acrylic-enabled');
        const backgroundColor = this.color(this.settings.get_string('background-color'), defaultBackground);
        const backgroundOpacity = acrylic ? this.settings.get_double('background-opacity') : 1;
        const borderColor = this.color(this.settings.get_string('border-color'), '#ffffff');
        const borderOpacity = this.settings.get_double('border-opacity');
        const borderSize = this.settings.get_int('border-size');
        const radius = [
            this.settings.get_int('radius-top-left'),
            this.settings.get_int('radius-top-right'),
            this.settings.get_int('radius-bottom-right'),
            this.settings.get_int('radius-bottom-left'),
        ].map(value => `${value}px`).join(' ');

        const top = this.settings.get_int('background-padding-top');
        const right = this.settings.get_int('background-padding-right');
        const bottom = this.settings.get_int('background-padding-bottom');
        const left = this.settings.get_int('background-padding-left');
        const spacing = this.settings.get_int('dock-spacing');

        this.background.set_style(
            `background-color: ${this.rgba(backgroundColor, backgroundOpacity)}; ` +
            `border: ${borderSize}px solid ${this.rgba(borderColor, borderOpacity)}; ` +
            `border-radius: ${radius};`,
        );
        this.actor.set_style(`padding: ${top}px ${right}px ${bottom}px ${left}px;`);
        this.content.set_style(`spacing: ${spacing}px; color: ${defaultForeground};`);
    }

    private color(value: string, fallback: string): string {
        return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
    }

    private rgba(hex: string, opacity: number): string {
        const value = hex.replace('#', '');
        const red = parseInt(value.slice(0, 2), 16);
        const green = parseInt(value.slice(2, 4), 16);
        const blue = parseInt(value.slice(4, 6), 16);
        return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, opacity))})`;
    }
}
