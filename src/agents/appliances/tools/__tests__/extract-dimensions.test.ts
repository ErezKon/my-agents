import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractDimensions, parseDimensionRange } from '../extract-dimensions.util';

describe('extractDimensions', () => {
    it('extracts Hebrew labeled width', () => {
        const result = extractDimensions(['מקרר ברוחב 90 ס"מ']);
        assert.equal(result.widthCm, 90);
    });

    it('extracts Hebrew labeled height and width', () => {
        const result = extractDimensions(['גובה: 185 ס"מ, רוחב: 90.5 ס"מ, עומק: 72 ס"מ']);
        assert.equal(result.heightCm, 185);
        assert.equal(result.widthCm, 90.5);
        assert.equal(result.depthCm, 72);
    });

    it('extracts triple dimensions (HxWxD)', () => {
        const result = extractDimensions(['dimensions 185×90×72 cm']);
        assert.equal(result.heightCm, 185);
        assert.equal(result.widthCm, 90);
        assert.equal(result.depthCm, 72);
    });

    it('extracts volume in liters (Hebrew)', () => {
        const result = extractDimensions(['קיבולת 500 ליטר']);
        assert.equal(result.volumeLiters, 500);
    });

    it('extracts volume in liters (English)', () => {
        const result = extractDimensions(['capacity 500 liters']);
        assert.equal(result.volumeLiters, 500);
    });

    it('extracts width from "ברוחב 90 ס"מ" pattern', () => {
        const result = extractDimensions(['מקרר בקו אפס, ברוחב 90 ס״מ ובעל יצרן קרח מובנה']);
        assert.equal(result.widthCm, 90);
    });

    it('extracts English labeled dimensions', () => {
        const result = extractDimensions(['Width: 90 cm, Height: 180 cm, Depth: 65 cm']);
        assert.equal(result.widthCm, 90);
        assert.equal(result.heightCm, 180);
        assert.equal(result.depthCm, 65);
    });

    it('returns null for missing dimensions', () => {
        const result = extractDimensions(['just some text about a refrigerator']);
        assert.equal(result.widthCm, null);
        assert.equal(result.heightCm, null);
        assert.equal(result.depthCm, null);
    });

    it('ignores implausible values', () => {
        const result = extractDimensions(['רוחב: 5 ס"מ']); // too small for a fridge
        assert.equal(result.widthCm, null);
    });

    it('handles combined snippets from multiple sources', () => {
        const result = extractDimensions([
            'מקרר סמסונג RF85K9002SR',
            'מפרט: רוחב 91.2 ס"מ',
            '500 ליטר נפח',
        ]);
        assert.equal(result.widthCm, 91.2);
        assert.equal(result.volumeLiters, 500);
    });

    it('extracts from spec table format "90.8×76.5"', () => {
        const result = extractDimensions(['193.5×90.8×76.5 ס"מ']);
        assert.equal(result.heightCm, 193.5);
        assert.equal(result.widthCm, 90.8);
        assert.equal(result.depthCm, 76.5);
    });

    it('identifies 60cm width correctly (should NOT match 90cm requirement)', () => {
        const result = extractDimensions(['מקרר 60 ס"מ גורניה 353 ליטר, רוחב 60 ס"מ']);
        assert.equal(result.widthCm, 60);
    });
});

describe('parseDimensionRange', () => {
    it('parses Hebrew range "רוחב 90-100 ס"מ"', () => {
        const range = parseDimensionRange('רוחב 90-100 ס"מ', 'width');
        assert.deepEqual(range, { min: 90, max: 100 });
    });

    it('parses single value "רוחב 90 ס"מ"', () => {
        const range = parseDimensionRange('רוחב 90 ס"מ', 'width');
        assert.deepEqual(range, { min: 90, max: 90 });
    });

    it('parses English range "width 90-100 cm"', () => {
        const range = parseDimensionRange('width 90-100 cm', 'width');
        assert.deepEqual(range, { min: 90, max: 100 });
    });

    it('returns null for unrelated text', () => {
        const range = parseDimensionRange('something else', 'width');
        assert.equal(range, null);
    });

    it('returns null for undefined requirements', () => {
        const range = parseDimensionRange(undefined, 'width');
        assert.equal(range, null);
    });

    it('parses height range', () => {
        const range = parseDimensionRange('גובה 170-200 ס"מ', 'height');
        assert.deepEqual(range, { min: 170, max: 200 });
    });
});
