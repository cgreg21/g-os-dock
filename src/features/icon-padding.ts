import Gio from 'gi://Gio?version=2.0';

/** Build the shared icon box style from the four dock padding preferences. */
export function getIconPaddingStyle(settings: Gio.Settings, size: number): string {
    const top = settings.get_int('icon-padding-top');
    const right = settings.get_int('icon-padding-right');
    const bottom = settings.get_int('icon-padding-bottom');
    const left = settings.get_int('icon-padding-left');

    return `padding: ${top}px ${right}px ${bottom}px ${left}px; ` +
        `min-width: ${size + left + right}px; ` +
        `min-height: ${size + top + bottom}px;`;
}
