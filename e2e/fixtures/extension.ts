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
const sponsorBlockApiPattern = "https://www.bsbsb.top/**";

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

function getLaunchProxy(): { server: string; bypass?: string } | undefined {
    const server = process.env.BSB_E2E_PROXY_SERVER?.trim();
    if (!server) {
        return undefined;
    }

    const bypass = process.env.BSB_E2E_PROXY_BYPASS?.trim();
    return bypass ? { server, bypass } : { server };
}

export const test = base.extend<ExtensionFixtures>({
    // Playwright requires fixture dependencies to use an object destructuring pattern.
    // eslint-disable-next-line no-empty-pattern
    extensionContext: async ({}, use) => {
        assertExtensionBuildExists();

        const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bsb-e2e-"));
        const directConnection = process.env.BSB_E2E_DIRECT === "1";
        const proxy = getLaunchProxy();
        if (directConnection && proxy) {
            throw new Error("BSB_E2E_DIRECT and BSB_E2E_PROXY_SERVER cannot be enabled together.");
        }

        const launchArgs = [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
        ];
        if (directConnection) {
            launchArgs.push("--no-proxy-server");
        }

        const context = await chromium.launchPersistentContext(userDataDir, {
            channel: "chromium",
            headless: process.env.BSB_E2E_HEADED !== "1" && !process.env.PWDEBUG,
            args: launchArgs,
            proxy,
        });

        try {
            const serviceWorker =
                context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
            await serviceWorker.evaluate(async () => {
                const chromeApi = (globalThis as { chrome: typeof chrome }).chrome;
                await Promise.all([
                    chromeApi.storage.local.set({ alreadyInstalled: true }),
                    chromeApi.storage.sync.set({
                        userID: "00000000-0000-4000-8000-000000000001",
                    }),
                ]);
            });
            await new Promise((resolve) => setTimeout(resolve, 1800));
            await Promise.all(
                context
                    .pages()
                    .filter((page) => page.url().includes("/help/index.html"))
                    .map((page) => page.close())
            );

            if (process.env.BSB_E2E_LIVE_API !== "1") {
                await context.route(sponsorBlockApiPattern, async (route) => {
                    const pathName = new URL(route.request().url()).pathname;
                    const isUserInfo = pathName === "/api/userInfo";
                    await route.fulfill({
                        status: pathName.startsWith("/api/skipSegments/") ? 404 : 200,
                        contentType: "application/json; charset=utf-8",
                        body: isUserInfo
                            ? JSON.stringify({
                                  userName: "",
                                  viewCount: 0,
                                  minutesSaved: 0,
                                  vip: false,
                                  permissions: {},
                                  segmentCount: 0,
                              })
                            : "[]",
                    });
                });
            }

            await use(context);
        } finally {
            await context.close();
            fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
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
        const page = extensionContext.pages()[0] ?? (await extensionContext.newPage());
        await use(page);
        await page.close();
    },

    sendContentMessage: async ({ extensionServiceWorker }, use) => {
        await use(async <TResponse = unknown>(message: unknown): Promise<TResponse> => {
            const startedAt = Date.now();
            let lastError = "content script did not respond";

            while (Date.now() - startedAt < contentMessageTimeoutMs) {
                try {
                    const result = await extensionServiceWorker.evaluate(
                        async <T>(request: unknown): Promise<ContentMessageResult<T>> => {
                            const chromeApi = (globalThis as { chrome: typeof chrome }).chrome;
                            const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) =>
                                chromeApi.tabs.query({}, resolve)
                            );
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
                } catch (error) {
                    lastError = error instanceof Error ? error.message : String(error);
                }
                await new Promise((resolve) => setTimeout(resolve, contentMessageRetryMs));
            }

            throw new Error(`Failed to send content message: ${lastError}`);
        });
    },
});

export { expect } from "@playwright/test";
