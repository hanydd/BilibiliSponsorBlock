import { VideoID } from "../types";

export type HashedValue = string & { __hashBrand: unknown };

export async function getHash<T extends string>(value: T, times = 5000): Promise<T & HashedValue> {
    if (times <= 0) return "" as T & HashedValue;

    if (!("subtle" in crypto)) {
        // Run in background script instead
        return new Promise((resolve, reject) =>
            chrome.runtime.sendMessage({ message: "getHash", value, times }, (response) => {
                if (response.error) {
                    reject(response.error);
                } else {
                    resolve(response);
                }
            })
        );
    }

    let hashHex: string = value;
    for (let i = 0; i < times; i++) {
        const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hashHex).buffer);

        const hashArray = Array.from(new Uint8Array(hashBuffer));
        hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    return hashHex as T & HashedValue;
}

export async function getVideoIDHash(videoID: VideoID): Promise<string> {
    return getHash(videoID.bvid, 1);
}
