import { EMPTY } from '../constants/constants';
import { HashUtils } from './hash-utils';

describe('HashUtils', () => {
    describe('fnv1a', () => {
        it('should match the reference FNV-1a 32 bit vectors', () => {
            expect(HashUtils.fnv1a(EMPTY)).toBe('811c9dc5');
            expect(HashUtils.fnv1a('a')).toBe('e40c292c');
            expect(HashUtils.fnv1a('foobar')).toBe('bf9cf968');
        });

        it('should be stable for the same input', () => {
            expect(HashUtils.fnv1a('Daily Specials')).toBe(HashUtils.fnv1a('Daily Specials'));
        });

        it('should always return eight lower case hexadecimal characters', () => {
            ['a', 'Grilled chicken with lemon', 'ção', '日本語', EMPTY].forEach((text: string) => {
                expect(HashUtils.fnv1a(text)).toMatch(/^[0-9a-f]{8}$/);
            });
        });

        it('should differ for small changes in the input', () => {
            const hashes: Set<string> = new Set<string>([
                HashUtils.fnv1a('hello'),
                HashUtils.fnv1a('Hello'),
                HashUtils.fnv1a('hellp'),
                HashUtils.fnv1a('hello '),
            ]);

            expect(hashes.size).toBe(4);
        });

        it('should not collide for a thousand distinct texts', () => {
            const hashes: Set<string> = new Set<string>();

            for (let position: number = 0; position < 1000; position++) {
                hashes.add(HashUtils.fnv1a(`menu item ${position}`));
            }

            expect(hashes.size).toBe(1000);
        });
    });
});
