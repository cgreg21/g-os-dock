import type { IndicatorMarkerStyleOptions } from './indicator-style.js';
import { normalizeUnitInterval } from './color-utils.js';

export interface IndicatorMarkerConfigurationInput {
    count: number;
    multiple: boolean;
    shape: string;
    size: number;
    color: string;
    opacity: number;
    borderSize: number;
    borderColor: string;
    borderOpacity: number;
}

export interface IndicatorMarkerConfiguration {
    count: number;
    style: IndicatorMarkerStyleOptions;
}

/** Resolve marker count and visual dimensions independently of GNOME actors. */
export function resolveIndicatorMarkerConfiguration(
    input: IndicatorMarkerConfigurationInput,
): IndicatorMarkerConfiguration {
    const markerCount = input.multiple ? Math.max(1, input.count) : 1;
    return {
        count: markerCount,
        style: {
            length: input.shape === 'line' ? input.size * 2 : input.size,
            thickness: input.size,
            radius: input.shape === 'round' ? '999px' : '0px',
            color: input.color,
            opacity: input.opacity,
            borderSize: input.borderSize,
            borderColor: input.borderColor,
            borderOpacity: input.borderOpacity,
        },
    };
}

/** Clamp a visual opacity setting to the CSS alpha range. */
export function normalizeIndicatorOpacity(value: number): number {
    return normalizeUnitInterval(value);
}
