import Config from "../../config";
import { callAPI } from "../background-request-proxy";
import { OTA_MAX_BYTES, parseOtaConfig } from "../../config/otaConfig";
import type { ValidatedOtaConfig } from "../../config/otaConfig";
import type { RulesConfig } from "../../config/sponsorRegexConfig";
import type { SponsorRegexCheckResult } from "../../config/sponsorRegexOTA";
import type { DynamicSponsorRegexRule } from "../../utils/sponsorRegex";
import * as shippedSponsorRegexFile from "../../../ota/sponsorRegex.json";

const CHECK_INTERVAL = 24 * 60 * 60 * 1000;
const RETRY_INTERVAL = 6 * 60 * 60 * 1000;
const MANUAL_INTERVAL = 5 * 60 * 1000;
let inFlight: Promise<SponsorRegexCheckResult> | null = null;
let lastCheckAt = 0;

async function fetchAndApplyOtaConfig(): Promise<SponsorRegexCheckResult> {
    try {
        const response = await callAPI("GET", "/api/ota", {}, false, {}, {
            httpsOnly: true,
            retry: true,
            maxResponseBytes: OTA_MAX_BYTES,
            recordFailure: false,
            switchOnRetrySuccess: false,
            validateResponse: (response) => {
                if (!response.ok) return false;
                try {
                    parseOtaConfig(response.responseText);
                    return true;
                } catch {
                    return false;
                }
            },
        });
        if (!response.ok) return { status: "failed" };

        // ok 为 true 表示正文已通过上述 OTA 校验；只解码最终响应，不重复校验规则。
        const config = JSON.parse(response.responseText) as ValidatedOtaConfig;
        const sponsorRegex = config.configs.sponsorRegex;
        return sponsorRegex ? applyRulesConfig(sponsorRegex.data) : { status: "up-to-date" };
    } catch (error) {
        console.warn("[BSB] OTA config check failed", error);
        return { status: "failed" };
    }
}

/** 仅在后台执行；手动检查可缩短检查间隔，但仍受最小间隔和并发合并约束。 */
export async function checkSponsorRegexConfigUpdate(force = false): Promise<SponsorRegexCheckResult> {
    await Config.ready;
    if (inFlight) return inFlight;
    const interval = Config.local.lastSponsorRegexConfigCheckFailed ? RETRY_INTERVAL : CHECK_INTERVAL;
    const minimumInterval = force ? MANUAL_INTERVAL : interval;
    const storedLastCheck = Config.local.lastSponsorRegexConfigCheck || 0;
    if (storedLastCheck < lastCheckAt) lastCheckAt = storedLastCheck;
    const lastCheck = Math.max(lastCheckAt, storedLastCheck);
    if (Date.now() - lastCheck < minimumInterval) {
        return { status: Config.local.lastSponsorRegexConfigCheckFailed ? "failed" : "up-to-date" };
    }
    // 请求前记录时间和失败状态，后台中断后仍按失败间隔重试，避免频繁拉取。
    lastCheckAt = Date.now();
    Config.local.lastSponsorRegexConfigCheck = lastCheckAt;
    Config.local.lastSponsorRegexConfigCheckFailed = true;

    inFlight = fetchAndApplyOtaConfig();
    try {
        const result = await inFlight;
        Config.local.lastSponsorRegexConfigCheckFailed = result.status === "failed";
        return result;
    } finally {
        inFlight = null;
    }
}

/**
 * 只有新增规则或更高版本的规则才触发快照替换，同 id 的旧版本保留本地内容。
 * 仅删除规则不会触发替换；发布删除操作时需同时提高至少一条保留规则的版本。
 */
export function applyRulesConfig(remote: RulesConfig): SponsorRegexCheckResult {
    const current: DynamicSponsorRegexRule[] = Config.local.sponsorRegexRemoteConfig?.rules ?? shippedSponsorRegexFile.data.rules;
    const byId = new Map(current.map((rule) => [rule.id, rule]));

    let updated = false;
    const rules = remote.rules.map((rule) => {
        const local = byId.get(rule.id);
        if (local && (local.version ?? 0) >= rule.version) return { ...local };

        updated = true;
        return { ...rule };
    });

    if (!updated) return { status: "up-to-date" };

    Config.local.sponsorRegexRemoteConfig = { rules };

    return { status: "updated" };
}
