import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';
import { dockCache } from '../../core/cache.js';
import { dockStyles } from '../../core/style-manager.js';
import { createRgbaColor, normalizeHexColor, normalizeUnitInterval } from '../../core/color-utils.js';

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
        const shadowEnabled = this.settings.get_boolean('background-shadow-enabled');
        const shadowColor = this.color(this.settings.get_string('background-shadow-color'), '#000000');
        const shadowOpacity = this.settings.get_double('background-shadow-opacity');
        const shadowX = this.settings.get_int('background-shadow-offset-x');
        const shadowY = this.settings.get_int('background-shadow-offset-y');
        const shadowBlur = this.settings.get_int('background-shadow-blur');
        const shadowSpread = this.settings.get_int('background-shadow-spread');
        const boxShadow = shadowEnabled
            ? `box-shadow: ${shadowX}px ${shadowY}px ${shadowBlur}px ${shadowSpread}px ${this.rgba(shadowColor, shadowOpacity)};`
            : 'box-shadow: none;';

        const backgroundStyle = dockCache.getOrCreate(
            `appearance-background-style:${backgroundColor}:${backgroundOpacity}:${borderSize}:${borderColor}:${borderOpacity}:${radius}:${boxShadow}`,
            () =>
                `background-color: ${this.rgba(backgroundColor, backgroundOpacity)}; ` +
                `border: ${borderSize}px solid ${this.rgba(borderColor, borderOpacity)}; ` +
                `border-radius: ${radius}; ` +
                boxShadow,
        );
        dockStyles.apply(this.background, backgroundStyle);

        const actorStyle = dockCache.getOrCreate(
            `appearance-actor-style:${top}:${right}:${bottom}:${left}`,
            () => `padding: ${top}px ${right}px ${bottom}px ${left}px;`,
        );
        dockStyles.apply(this.actor, actorStyle);

        const contentStyle = dockCache.getOrCreate(
            `appearance-content-style:${spacing}:${defaultForeground}`,
            () => `spacing: ${spacing}px; color: ${defaultForeground};`,
        );
        dockStyles.apply(this.content, contentStyle);
    }

    private color(value: string, fallback: string): string {
        return dockCache.getOrCreate(`appearance-color:${value}:${fallback}`, () =>
            normalizeHexColor(value, fallback),
        );
    }

    private rgba(hex: string, opacity: number): string {
        const normalizedOpacity = normalizeUnitInterval(opacity);
        return dockCache.getOrCreate(`rgba:${hex}:${normalizedOpacity}`, () =>
            createRgbaColor(hex, normalizedOpacity),
        );
    }
}
