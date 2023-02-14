export type HashedValue = string & { __hashBrand: unknown };

export async function getHash<T extends string>(value: T, times = 5000): Promise<T & HashedValue> {
    if (times <= 0) return "" as T & HashedValue;

    let hashHex: string = value;
    for (let i = 0; i < times; i++) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashHex).buffer);

        const hashArray = Array.from(new Uint8Array(hashBuffer));
        hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    return hashHex as T & HashedValue;
}