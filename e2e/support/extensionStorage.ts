import type { Worker } from "@playwright/test";

export async function readSyncStorage<T>(serviceWorker: Worker, key: string): Promise<T> {
    return await serviceWorker.evaluate(async (storageKey) => {
        const chromeApi = (globalThis as { chrome: typeof chrome }).chrome;
        const result = await chromeApi.storage.sync.get(storageKey);
        return result[storageKey];
    }, key);
}

export async function readLocalStorage<T>(serviceWorker: Worker, key: string): Promise<T> {
    return await serviceWorker.evaluate(async (storageKey) => {
        const chromeApi = (globalThis as { chrome: typeof chrome }).chrome;
        const result = await chromeApi.storage.local.get(storageKey);
        return result[storageKey];
    }, key);
}

export async function writeSyncStorage(serviceWorker: Worker, values: Record<string, unknown>): Promise<void> {
    await serviceWorker.evaluate(async (storageValues) => {
        const chromeApi = (globalThis as { chrome: typeof chrome }).chrome;
        await chromeApi.storage.sync.set(storageValues);
    }, values);
}

export async function writeLocalStorage(serviceWorker: Worker, values: Record<string, unknown>): Promise<void> {
    await serviceWorker.evaluate(async (storageValues) => {
        const chromeApi = (globalThis as { chrome: typeof chrome }).chrome;
        await chromeApi.storage.local.set(storageValues);
    }, values);
}
