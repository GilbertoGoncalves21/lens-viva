export class HashUtils {
    static fnv1a(text: string): string {
        let hash: number = 0x811c9dc5;

        for (let index: number = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193);
        }

        return (hash >>> 0).toString(16).padStart(8, '0');
    }
}
