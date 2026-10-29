const REDUCED_MOTION_QUERY: string = '(prefers-reduced-motion: reduce)';

export class MotionUtils {
    static prefersReducedMotion(): boolean {
        return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
    }
}
