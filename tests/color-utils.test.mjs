import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createRgbaColor,
    hexColorToRgb,
    normalizeHexColor,
    normalizeUnitInterval,
} from '../dist/features/color-utils.js';

test('preserves valid hexadecimal colors', () => {
    assert.equal(normalizeHexColor('#e6E6f0', '#000000'), '#e6E6f0');
});

test('uses the supplied fallback for invalid hexadecimal colors', () => {
    assert.equal(normalizeHexColor('red', '#123456'), '#123456');
    assert.equal(normalizeHexColor('#12345', '#abcdef'), '#abcdef');
});

test('converts hexadecimal colors to RGB tuples', () => {
    assert.equal(hexColorToRgb('#e6E6f0'), '230, 230, 240');
    assert.equal(hexColorToRgb('#000000'), '0, 0, 0');
});

test('formats rgba colors and clamps alpha', () => {
    assert.equal(createRgbaColor('#e6e6f0', 0.5), 'rgba(230, 230, 240, 0.5)');
    assert.equal(createRgbaColor('#123456', -1), 'rgba(18, 52, 86, 0)');
    assert.equal(createRgbaColor('#123456', 2), 'rgba(18, 52, 86, 1)');
});

test('uses a safe black fallback when formatting invalid colors', () => {
    assert.equal(createRgbaColor('invalid', 0.25), 'rgba(0, 0, 0, 0.25)');
});

test('normalizes generic unit-interval values', () => {
    assert.equal(normalizeUnitInterval(-1), 0);
    assert.equal(normalizeUnitInterval(0.35), 0.35);
    assert.equal(normalizeUnitInterval(1), 1);
    assert.equal(normalizeUnitInterval(2), 1);
});
