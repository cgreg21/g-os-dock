import { hexColorToRgb, normalizeHexColor } from '../../core/color-utils.js';

export interface IndicatorMarkerStyleOptions {
    length: number;
    thickness: number;
    radius: string;
    color: string;
    opacity: number;
    borderSize: number;
    borderColor: string;
    borderOpacity: number;
}

/** Convert a validated hexadecimal color into an RGB CSS tuple. */
export function resolveIndicatorColor(value: string): string {
    return hexColorToRgb(normalizeHexColor(value, '#e6e6f0'));
}

/** Stable cache key for one marker's visual style, excluding the number of markers. */
export function createIndicatorMarkerStyleKey(options: IndicatorMarkerStyleOptions): string {
    return [
        options.length,
        options.thickness,
        options.radius,
        options.color,
        options.opacity,
        options.borderSize,
        options.borderColor,
        options.borderOpacity,
    ].join(':');
}

/** Stable signature for a complete indicator configuration, including marker count. */
export function createIndicatorMarkerSignature(
    markerCount: number,
    options: IndicatorMarkerStyleOptions,
): string {
    return `${markerCount}:${createIndicatorMarkerStyleKey(options)}`;
}

/** Build the CSS used by one visual marker without depending on GNOME actors. */
export function createIndicatorMarkerStyle(options: IndicatorMarkerStyleOptions): string {
    return `width: ${options.length}px; height: ${options.thickness}px; ` +
        `border-radius: ${options.radius}; background-color: rgba(${options.color}, ${options.opacity}); ` +
        `border: ${options.borderSize}px solid rgba(${options.borderColor}, ${options.borderOpacity});`;
}
