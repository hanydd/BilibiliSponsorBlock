import type { Page, TestInfo } from "@playwright/test";
import { test } from "../fixtures/extension";

export async function openRealBilibiliPage(
    page: Page,
    testInfo: TestInfo,
    requestedUrl: string
): Promise<void> {
    let responseStatus: number | null = null;
    try {
        const response = await page.goto(requestedUrl, {
            waitUntil: "domcontentloaded",
            timeout: 60_000,
        });
        responseStatus = response?.status() ?? null;
    } catch (error) {
        throw new Error(
            `Unable to open the real Bilibili page. If a system proxy is interfering, retry with ` +
                `BSB_E2E_DIRECT=1. Original error: ${error instanceof Error ? error.message : String(error)}`
        );
    }

    const title = await page.title();
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const securityBlocked =
        responseStatus === 412 || /错误号\s*[:：]?\s*412|请求被拦截|访问被拒绝/.test(bodyText);
    const diagnostics = {
        requestedUrl,
        finalUrl: page.url(),
        responseStatus,
        title,
        securityBlocked,
        directConnection: process.env.BSB_E2E_DIRECT === "1",
        explicitProxy: Boolean(process.env.BSB_E2E_PROXY_SERVER),
    };

    console.log(`[e2e:real] ${JSON.stringify(diagnostics)}`);
    await testInfo.attach("bilibili-page-diagnostics", {
        body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
        contentType: "application/json",
    });

    test.skip(
        securityBlocked,
        "Bilibili returned a security-control page (usually HTTP 412). Retry from a trusted direct network with BSB_E2E_DIRECT=1."
    );
}
