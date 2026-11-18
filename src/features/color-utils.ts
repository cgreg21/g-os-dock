/** Shared hexadecimal color validation and CSS conversion helpers. */
export function normalizeHexColor(value: string, fallback: string): string {
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

/** Convert a six-digit hexadecimal color to a comma-separated RGB tuple. */
export function hexColorToRgb(value: string): string {
    const normalized = normalizeHexColor(value, '#000000');
    const hex = normalized.slice(1);
    return `${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}`;
}

/** Format a hexadecimal color and alpha value as a CSS rgba() expression. */
export function createRgbaColor(value: string, opacity: number): string {
    const normalized = normalizeHexColor(value, '#000000');
    const alpha = Math.max(0, Math.min(1, opacity));
    return `rgba(${hexColorToRgb(normalized)}, ${alpha})`;
}
