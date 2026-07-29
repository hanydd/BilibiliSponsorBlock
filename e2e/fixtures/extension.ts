import { test as base, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";

type ExtensionFixtures = {
    extensionContext: BrowserContext;
    extensionId: string;
    extensionPage: Page;
};

const extensionPath = path.resolve(__dirname, "../../dist");

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

    extensionId: async ({ extensionContext }, use) => {
        let serviceWorker: Worker | undefined = extensionContext.serviceWorkers()[0];
        if (!serviceWorker) {
            serviceWorker = await extensionContext.waitForEvent("serviceworker");
        }

        await use(new URL(serviceWorker.url()).host);
    },

    extensionPage: async ({ extensionContext }, use) => {
        const page = await extensionContext.newPage();
        await use(page);
        await page.close();
    },
});

export { expect } from "@playwright/test";
