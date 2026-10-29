import { NormalizedRect, ScreenRect } from '../../models';

const FULL_TURN_DEGREES: number = 360;

const HALF_TURN_DEGREES: number = 180;

export class GeometryUtils {
    static area(rect: NormalizedRect): number {
        return Math.max(0, rect.width) * Math.max(0, rect.height);
    }

    static centerDistance(first: NormalizedRect, second: NormalizedRect): number {
        const deltaX: number = first.x + first.width / 2 - (second.x + second.width / 2);
        const deltaY: number = first.y + first.height / 2 - (second.y + second.height / 2);

        return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    }

    static clamp(value: number, minimum: number, maximum: number): number {
        return Math.min(maximum, Math.max(minimum, value));
    }

    static clampRect(rect: NormalizedRect): NormalizedRect {
        const left: number = GeometryUtils.clamp(rect.x, 0, 1);
        const top: number = GeometryUtils.clamp(rect.y, 0, 1);
        const right: number = GeometryUtils.clamp(rect.x + rect.width, 0, 1);
        const bottom: number = GeometryUtils.clamp(rect.y + rect.height, 0, 1);

        return { height: Math.max(0, bottom - top), width: Math.max(0, right - left), x: left, y: top };
    }

    static hasMoved(previous: NormalizedRect, current: NormalizedRect, threshold: number): boolean {
        return (
            Math.abs(previous.x - current.x) > threshold ||
            Math.abs(previous.y - current.y) > threshold ||
            Math.abs(previous.width - current.width) > threshold ||
            Math.abs(previous.height - current.height) > threshold
        );
    }

    static interpolate(from: number, to: number, factor: number): number {
        return from + (to - from) * factor;
    }

    static interpolateAngle(from: number, to: number, factor: number): number {
        const difference: number = (((to - from) % FULL_TURN_DEGREES) + FULL_TURN_DEGREES + HALF_TURN_DEGREES) % FULL_TURN_DEGREES - HALF_TURN_DEGREES;

        return from + difference * factor;
    }

    static interpolateRect(from: NormalizedRect, to: NormalizedRect, factor: number): NormalizedRect {
        return {
            height: from.height + (to.height - from.height) * factor,
            width: from.width + (to.width - from.width) * factor,
            x: from.x + (to.x - from.x) * factor,
            y: from.y + (to.y - from.y) * factor,
        };
    }

    static intersectionOverUnion(first: NormalizedRect, second: NormalizedRect): number {
        const intersection: number = GeometryUtils.intersectionArea(first, second);
        const union: number = GeometryUtils.area(first) + GeometryUtils.area(second) - intersection;

        return union > 0 ? intersection / union : 0;
    }

    static normalizeScreenRect(rect: ScreenRect | null | undefined): ScreenRect | null {
        if (!rect) {
            return null;
        }

        const values: number[] = [rect.height, rect.width, rect.x, rect.y];

        if (!values.every((value: number) => Number.isFinite(value)) || rect.width < 0 || rect.height < 0) {
            return null;
        }

        return { height: rect.height, width: rect.width, x: rect.x, y: rect.y };
    }

    static overlapRatio(first: NormalizedRect, second: NormalizedRect): number {
        const smallerArea: number = Math.min(GeometryUtils.area(first), GeometryUtils.area(second));

        return smallerArea > 0 ? GeometryUtils.intersectionArea(first, second) / smallerArea : 0;
    }

    static sameScreenRect(first: ScreenRect | null, second: ScreenRect | null, tolerance: number): boolean {
        if (!first || !second) {
            return first === second;
        }

        return (
            Math.abs(first.x - second.x) <= tolerance &&
            Math.abs(first.y - second.y) <= tolerance &&
            Math.abs(first.width - second.width) <= tolerance &&
            Math.abs(first.height - second.height) <= tolerance
        );
    }

    private static intersectionArea(first: NormalizedRect, second: NormalizedRect): number {
        const left: number = Math.max(first.x, second.x);
        const top: number = Math.max(first.y, second.y);
        const right: number = Math.min(first.x + first.width, second.x + second.width);
        const bottom: number = Math.min(first.y + first.height, second.y + second.height);

        return Math.max(0, right - left) * Math.max(0, bottom - top);
    }
}
