import type { Mock } from 'vitest';
import { MotionUtils } from './motion-utils';

type MatchMediaFunction = (query: string) => MediaQueryList;

describe('MotionUtils', () => {
    const originalMatchMedia: MatchMediaFunction | undefined = window.matchMedia;

    function stubMatchMedia(matches: boolean): Mock<MatchMediaFunction> {
        const matchMedia: Mock<MatchMediaFunction> = vi.fn<MatchMediaFunction>(() => ({ matches: matches }) as MediaQueryList);

        Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia, writable: true });

        return matchMedia;
    }

    afterEach(() => {
        Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia, writable: true });
    });

    describe('prefersReducedMotion', () => {
        it('should be true when the system asks to reduce motion', () => {
            const matchMedia: Mock<MatchMediaFunction> = stubMatchMedia(true);

            expect(MotionUtils.prefersReducedMotion()).toBe(true);
            expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
        });

        it('should be false when the system allows motion', () => {
            stubMatchMedia(false);

            expect(MotionUtils.prefersReducedMotion()).toBe(false);
        });

        it('should be false when media queries are not available', () => {
            Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined, writable: true });

            expect(MotionUtils.prefersReducedMotion()).toBe(false);
        });
    });
});
