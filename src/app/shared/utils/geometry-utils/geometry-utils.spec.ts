import { NormalizedRect, ScreenRect } from '../../models';
import { GeometryUtils } from './geometry-utils';

describe('GeometryUtils', () => {
    const baseRect: NormalizedRect = { height: 0.25, width: 0.25, x: 0.25, y: 0.25 };

    describe('area', () => {
        it('should multiply width by height', () => {
            expect(GeometryUtils.area({ height: 0.5, width: 0.2, x: 0, y: 0 })).toBeCloseTo(0.1);
        });

        it('should treat negative sizes as zero', () => {
            expect(GeometryUtils.area({ height: -0.5, width: 0.2, x: 0, y: 0 })).toBe(0);
            expect(GeometryUtils.area({ height: 0.5, width: -0.2, x: 0, y: 0 })).toBe(0);
        });
    });

    describe('centerDistance', () => {
        it('should be zero for the same rect', () => {
            expect(GeometryUtils.centerDistance(baseRect, baseRect)).toBe(0);
        });

        it('should compute the euclidean distance between centers', () => {
            const moved: NormalizedRect = { ...baseRect, x: baseRect.x + 0.3, y: baseRect.y + 0.4 };

            expect(GeometryUtils.centerDistance(baseRect, moved)).toBeCloseTo(0.5);
        });
    });

    describe('clamp', () => {
        it('should keep values inside the range', () => {
            expect(GeometryUtils.clamp(0.4, 0, 1)).toBe(0.4);
        });

        it('should clamp values below the minimum', () => {
            expect(GeometryUtils.clamp(-2, 0, 1)).toBe(0);
        });

        it('should clamp values above the maximum', () => {
            expect(GeometryUtils.clamp(5, 0, 1)).toBe(1);
        });

        it('should accept the bounds themselves', () => {
            expect(GeometryUtils.clamp(0, 0, 1)).toBe(0);
            expect(GeometryUtils.clamp(1, 0, 1)).toBe(1);
        });
    });

    describe('clampRect', () => {
        it('should keep a rect that is already inside the viewport', () => {
            expect(GeometryUtils.clampRect(baseRect)).toEqual(baseRect);
        });

        it('should crop the parts outside the viewport', () => {
            const clamped: NormalizedRect = GeometryUtils.clampRect({ height: 0.2, width: 0.3, x: -0.1, y: 0.9 });

            expect(clamped.x).toBe(0);
            expect(clamped.y).toBeCloseTo(0.9);
            expect(clamped.width).toBeCloseTo(0.2);
            expect(clamped.height).toBeCloseTo(0.1);
        });

        it('should collapse a rect that is completely outside the viewport', () => {
            const clamped: NormalizedRect = GeometryUtils.clampRect({ height: 0.2, width: 0.3, x: 1.2, y: -0.5 });

            expect(clamped.width).toBe(0);
            expect(clamped.height).toBe(0);
            expect(clamped.x).toBe(1);
            expect(clamped.y).toBe(0);
        });
    });

    describe('hasMoved', () => {
        it('should be false when every delta is inside the threshold', () => {
            const moved: NormalizedRect = { ...baseRect, x: baseRect.x + 0.005, y: baseRect.y - 0.005 };

            expect(GeometryUtils.hasMoved(baseRect, moved, 0.01)).toBe(false);
        });

        it('should be true when the position changes beyond the threshold', () => {
            expect(GeometryUtils.hasMoved(baseRect, { ...baseRect, y: baseRect.y + 0.05 }, 0.01)).toBe(true);
        });

        it('should be true when the size changes beyond the threshold', () => {
            expect(GeometryUtils.hasMoved(baseRect, { ...baseRect, width: baseRect.width + 0.05 }, 0.01)).toBe(true);
            expect(GeometryUtils.hasMoved(baseRect, { ...baseRect, height: baseRect.height - 0.05 }, 0.01)).toBe(true);
        });
    });

    describe('interpolate', () => {
        it('should move a value toward its target by the given factor', () => {
            expect(GeometryUtils.interpolate(0.2, 0.6, 0)).toBe(0.2);
            expect(GeometryUtils.interpolate(0.2, 0.6, 1)).toBeCloseTo(0.6);
            expect(GeometryUtils.interpolate(0.2, 0.6, 0.25)).toBeCloseTo(0.3);
            expect(GeometryUtils.interpolate(0.6, 0.2, 0.5)).toBeCloseTo(0.4);
        });
    });

    describe('interpolateAngle', () => {
        it('should move an angle toward its target by the given factor', () => {
            expect(GeometryUtils.interpolateAngle(2, 10, 0)).toBe(2);
            expect(GeometryUtils.interpolateAngle(2, 10, 1)).toBeCloseTo(10);
            expect(GeometryUtils.interpolateAngle(-4, 4, 0.5)).toBeCloseTo(0);
        });

        it('should turn the short way around when the angles are on both sides of a half turn', () => {
            expect(GeometryUtils.interpolateAngle(179, -179, 0.5)).toBeCloseTo(180);
            expect(GeometryUtils.interpolateAngle(-179, 179, 0.5)).toBeCloseTo(-180);
            expect(GeometryUtils.interpolateAngle(350, 10, 1)).toBeCloseTo(370);
        });
    });

    describe('interpolateRect', () => {
        const target: NormalizedRect = { height: 0.4, width: 0.6, x: 0.5, y: 0.3 };

        it('should return the origin with factor 0', () => {
            expect(GeometryUtils.interpolateRect(baseRect, target, 0)).toEqual(baseRect);
        });

        it('should return the target with factor 1', () => {
            const interpolated: NormalizedRect = GeometryUtils.interpolateRect(baseRect, target, 1);

            expect(interpolated.x).toBeCloseTo(target.x);
            expect(interpolated.y).toBeCloseTo(target.y);
            expect(interpolated.width).toBeCloseTo(target.width);
            expect(interpolated.height).toBeCloseTo(target.height);
        });

        it('should return the midpoint with factor 0.5', () => {
            const interpolated: NormalizedRect = GeometryUtils.interpolateRect(baseRect, target, 0.5);

            expect(interpolated.x).toBeCloseTo(0.375);
            expect(interpolated.y).toBeCloseTo(0.275);
            expect(interpolated.width).toBeCloseTo(0.425);
            expect(interpolated.height).toBeCloseTo(0.325);
        });
    });

    describe('intersectionOverUnion', () => {
        it('should be 1 for identical rects', () => {
            expect(GeometryUtils.intersectionOverUnion(baseRect, { ...baseRect })).toBeCloseTo(1);
        });

        it('should be 0 for disjoint rects', () => {
            expect(GeometryUtils.intersectionOverUnion(baseRect, { ...baseRect, x: 0.7 })).toBe(0);
        });

        it('should be 0 for rects that only touch edges', () => {
            expect(GeometryUtils.intersectionOverUnion(baseRect, { ...baseRect, x: baseRect.x + baseRect.width })).toBe(0);
        });

        it('should be one third for rects overlapping by half their width', () => {
            const first: NormalizedRect = { height: 0.2, width: 0.2, x: 0, y: 0 };
            const second: NormalizedRect = { height: 0.2, width: 0.2, x: 0.1, y: 0 };

            expect(GeometryUtils.intersectionOverUnion(first, second)).toBeCloseTo(1 / 3);
        });

        it('should be the area ratio when one rect contains the other', () => {
            const outer: NormalizedRect = { height: 0.2, width: 0.2, x: 0, y: 0 };
            const inner: NormalizedRect = { height: 0.1, width: 0.1, x: 0.05, y: 0.05 };

            expect(GeometryUtils.intersectionOverUnion(outer, inner)).toBeCloseTo(0.25);
        });

        it('should be symmetric', () => {
            const other: NormalizedRect = { height: 0.3, width: 0.1, x: 0.3, y: 0.1 };

            expect(GeometryUtils.intersectionOverUnion(baseRect, other)).toBeCloseTo(GeometryUtils.intersectionOverUnion(other, baseRect));
        });

        it('should be 0 when both rects have no area', () => {
            const empty: NormalizedRect = { height: 0, width: 0, x: 0.5, y: 0.5 };

            expect(GeometryUtils.intersectionOverUnion(empty, empty)).toBe(0);
        });
    });

    describe('normalizeScreenRect', () => {
        it('should return a plain copy of a valid rect', () => {
            const rect: ScreenRect = { height: 487.5, width: 390, x: 0, y: 56 };
            const normalized: ScreenRect | null = GeometryUtils.normalizeScreenRect(rect);

            expect(normalized).toEqual(rect);
            expect(normalized).not.toBe(rect);
        });

        it('should copy only the rect fields of a DOMRect-like object', () => {
            const domRectLike: ScreenRect & { bottom: number; right: number } = { bottom: 300, height: 200, right: 120, width: 100, x: 20, y: 100 };

            expect(GeometryUtils.normalizeScreenRect(domRectLike)).toEqual({ height: 200, width: 100, x: 20, y: 100 });
        });

        it('should accept an empty size', () => {
            expect(GeometryUtils.normalizeScreenRect({ height: 0, width: 0, x: 0, y: 0 })).toEqual({ height: 0, width: 0, x: 0, y: 0 });
        });

        it('should return null for a missing rect', () => {
            expect(GeometryUtils.normalizeScreenRect(null)).toBeNull();
            expect(GeometryUtils.normalizeScreenRect(undefined)).toBeNull();
        });

        it('should return null for non finite values', () => {
            expect(GeometryUtils.normalizeScreenRect({ height: Number.NaN, width: 100, x: 0, y: 0 })).toBeNull();
            expect(GeometryUtils.normalizeScreenRect({ height: 100, width: Number.POSITIVE_INFINITY, x: 0, y: 0 })).toBeNull();
            expect(GeometryUtils.normalizeScreenRect({ height: 100, width: 100, x: Number.NaN, y: 0 })).toBeNull();
            expect(GeometryUtils.normalizeScreenRect({ height: 100, width: 100, x: 0, y: '4' as unknown as number })).toBeNull();
        });

        it('should return null for negative sizes', () => {
            expect(GeometryUtils.normalizeScreenRect({ height: -1, width: 100, x: 0, y: 0 })).toBeNull();
            expect(GeometryUtils.normalizeScreenRect({ height: 100, width: -1, x: 0, y: 0 })).toBeNull();
        });
    });

    describe('overlapRatio', () => {
        it('should be 1 for identical rects', () => {
            expect(GeometryUtils.overlapRatio(baseRect, { ...baseRect })).toBeCloseTo(1);
        });

        it('should be 1 when one rect contains the other, in either order', () => {
            const outer: NormalizedRect = { height: 0.2, width: 0.6, x: 0, y: 0 };
            const inner: NormalizedRect = { height: 0.1, width: 0.1, x: 0.05, y: 0.05 };

            expect(GeometryUtils.overlapRatio(outer, inner)).toBeCloseTo(1);
            expect(GeometryUtils.overlapRatio(inner, outer)).toBeCloseTo(1);
        });

        it('should measure the overlap against the smaller rect', () => {
            const line: NormalizedRect = { height: 0.05, width: 0.4, x: 0.1, y: 0.2 };
            const block: NormalizedRect = { height: 0.2, width: 0.6, x: 0.1, y: 0.225 };

            expect(GeometryUtils.overlapRatio(line, block)).toBeCloseTo(0.5);
            expect(GeometryUtils.overlapRatio(block, line)).toBeCloseTo(0.5);
        });

        it('should be 0 for disjoint rects or rects that only touch edges', () => {
            expect(GeometryUtils.overlapRatio(baseRect, { ...baseRect, x: 0.7 })).toBe(0);
            expect(GeometryUtils.overlapRatio(baseRect, { ...baseRect, y: baseRect.y + baseRect.height })).toBe(0);
        });

        it('should be 0 when a rect has no area', () => {
            expect(GeometryUtils.overlapRatio(baseRect, { height: 0, width: 0, x: 0.3, y: 0.3 })).toBe(0);
        });
    });

    describe('sameScreenRect', () => {
        const screenRect: ScreenRect = { height: 500, width: 400, x: 0, y: 60 };

        it('should treat two missing rects as the same', () => {
            expect(GeometryUtils.sameScreenRect(null, null, 0.5)).toBe(true);
        });

        it('should treat a missing rect and a rect as different', () => {
            expect(GeometryUtils.sameScreenRect(null, screenRect, 0.5)).toBe(false);
            expect(GeometryUtils.sameScreenRect(screenRect, null, 0.5)).toBe(false);
        });

        it('should treat rects within the tolerance as the same', () => {
            expect(GeometryUtils.sameScreenRect(screenRect, { ...screenRect }, 0)).toBe(true);
            expect(GeometryUtils.sameScreenRect(screenRect, { height: 500.4, width: 399.6, x: 0.5, y: 59.5 }, 0.5)).toBe(true);
        });

        it('should detect a change of any field beyond the tolerance', () => {
            expect(GeometryUtils.sameScreenRect(screenRect, { ...screenRect, x: 1 }, 0.5)).toBe(false);
            expect(GeometryUtils.sameScreenRect(screenRect, { ...screenRect, y: 61 }, 0.5)).toBe(false);
            expect(GeometryUtils.sameScreenRect(screenRect, { ...screenRect, width: 401 }, 0.5)).toBe(false);
            expect(GeometryUtils.sameScreenRect(screenRect, { ...screenRect, height: 499 }, 0.5)).toBe(false);
        });
    });
});
