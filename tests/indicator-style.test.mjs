import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createIndicatorMarkerSignature,
    createIndicatorMarkerStyle,
    resolveIndicatorColor,
} from '../dist/features/indicator-style.js';

const options = {
    length: 12,
    thickness: 4,
    radius: '999px',
    color: '230, 230, 240',
    opacity: 0.8,
    borderSize: 1,
    borderColor: '10, 20, 30',
    borderOpacity: 0.5,
};

test('converts hexadecimal colors to RGB tuples', () => {
    assert.equal(resolveIndicatorColor('#e6E6f0'), '230, 230, 240');
});

test('uses the fallback color for invalid values', () => {
    assert.equal(resolveIndicatorColor('not-a-color'), '230, 230, 240');
});

test('creates a stable signature including marker count and all style values', () => {
    assert.equal(
        createIndicatorMarkerSignature(3, options),
        '3:12:4:999px:230, 230, 240:0.8:1:10, 20, 30:0.5',
    );
    assert.notEqual(
        createIndicatorMarkerSignature(2, options),
        createIndicatorMarkerSignature(3, options),
    );
});

test('builds marker CSS from the supplied style options', () => {
    assert.equal(
        createIndicatorMarkerStyle(options),
        'width: 12px; height: 4px; border-radius: 999px; ' +
        'background-color: rgba(230, 230, 240, 0.8); ' +
        'border: 1px solid rgba(10, 20, 30, 0.5);',
    );
});
