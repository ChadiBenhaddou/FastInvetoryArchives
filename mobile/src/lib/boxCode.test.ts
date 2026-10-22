import { describe, expect, it } from 'vitest';
import vectors from '../../../shared/box-code-vectors.json';
import { ALPHABET, InvalidBoxCode, makeCode, parse } from './boxCode';

describe('box codes (shared vectors)', () => {
    it('uses the shared alphabet', () => {
        expect(ALPHABET).toBe(vectors.alphabet);
    });

    it.each(vectors.valid)('generates and parses $code', ({ device, sequence, code }) => {
        expect(makeCode(device, sequence)).toBe(code);
        expect(parse(code)).toEqual({ device, sequence, code });
    });

    it.each(vectors.invalid)('rejects "$input" ($reason)', ({ input, reason }) => {
        expect(() => parse(input)).toThrow(InvalidBoxCode);
        try {
            parse(input);
        } catch (e) {
            expect((e as InvalidBoxCode).reason).toBe(reason);
        }
    });

    it.each(vectors.normalize)('normalizes "$input"', ({ input, code }) => {
        expect(parse(input).code).toBe(code);
    });

    it('rejects out-of-range sequences when generating', () => {
        expect(() => makeCode('A', 0)).toThrow(InvalidBoxCode);
        expect(() => makeCode('A', 10000)).toThrow(InvalidBoxCode);
        expect(() => makeCode('O', 1)).toThrow(InvalidBoxCode);
    });
});
