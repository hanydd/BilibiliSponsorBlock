import { test as base, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";

type ExtensionFixtures = {
    extensionContext: BrowserContext;
    extensionId: string;
    extensionPage: Page;
    extensionServiceWorker: Worker;
    sendContentMessage: <TResponse = unknown>(message: unknown) => Promise<TResponse>;
};

const extensionPath = path.resolve(__dirname, "../../dist");
const contentMessageTimeoutMs = 30_000;
const contentMessageRetryMs = 100;

type ContentMessageResult<TResponse> = {
    ok: boolean;
    response?: TResponse;
    error?: string;
};

function assertExtensionBuildExists(): void {
    if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) {
        throw new Error("Extension build not found. Run `npm run build:dev` before Playwright tests.");
    }
}

export const test = base.extend<ExtensionFixtures>({
    extensionContext: async ({}, use) => {
        assertExtensionBuildExists();

        const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bsb-e2e-"));
        const context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            args: [
                `--disable-extensions-except=${extensionPath}`,
                `--load-extension=${extensionPath}`,
            ],
        });

        try {
            await use(context);
        } finally {
            await context.close();
            fs.rmSync(userDataDir, { recursive: true, force: true });
        }
    },

    extensionServiceWorker: async ({ extensionContext }, use) => {
        let serviceWorker: Worker | undefined = extensionContext.serviceWorkers()[0];
        if (!serviceWorker) {
            serviceWorker = await extensionContext.waitForEvent("serviceworker");
        }

        await use(serviceWorker);
    },

    extensionId: async ({ extensionServiceWorker }, use) => {
        await use(new URL(extensionServiceWorker.url()).host);
    },

    extensionPage: async ({ extensionContext }, use) => {
        const page = await extensionContext.newPage();
        await use(page);
        await page.close();
    },

    sendContentMessage: async ({ extensionServiceWorker }, use) => {
        await use(async <TResponse = unknown>(message: unknown): Promise<TResponse> => {
            const startedAt = Date.now();
            let lastError = "content script did not respond";

            while (Date.now() - startedAt < contentMessageTimeoutMs) {
                const result = await extensionServiceWorker.evaluate(
                    async <T>(request: unknown): Promise<ContentMessageResult<T>> => {
                        const chromeApi = (globalThis as { chrome: typeof chrome }).chrome;
                        const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => chromeApi.tabs.query({}, resolve));
                        const tab = tabs.find((candidate) => candidate.url?.startsWith("https://www.bilibili.com/"));

                        if (!tab?.id) {
                            return { ok: false, error: "No bilibili tab found" };
                        }

                        return await new Promise<ContentMessageResult<T>>((resolve) => {
                            chromeApi.tabs.sendMessage(tab.id, request, (response: T) => {
                                const error = chromeApi.runtime.lastError?.message;
                                resolve(error ? { ok: false, error } : { ok: true, response });
                            });
                        });
                    },
                    message
                );

                if (result.ok) {
                    return result.response as TResponse;
                }

                lastError = result.error ?? lastError;
                await new Promise((resolve) => setTimeout(resolve, contentMessageRetryMs));
            }

            throw new Error(`Failed to send content message: ${lastError}`);
        });
    },
});

export { expect } from "@playwright/test";
