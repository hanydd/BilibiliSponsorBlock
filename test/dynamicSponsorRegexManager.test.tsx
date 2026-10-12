/** @jest-environment jsdom */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("../src/config", () => ({
    __esModule: true,
    default: {
        config: {
            dynamicAndCommentSponsorRegexUserRules: [],
            dynamicAndCommentSponsorRegexFlags: "gi",
        },
        local: { sponsorRegexRemoteConfig: null },
    },
}));

describe("DynamicSponsorRegexManagerComponent", () => {
    beforeEach(() => {
        (global as unknown as { chrome: unknown }).chrome = {
            i18n: {
                getMessage: (key: string) => key,
                getUILanguage: () => "en-US",
            },
        };
    });

    test("渲染默认词条、启用状态、匹配模式与来源状态", async () => {
        const DynamicSponsorRegexManagerComponent = (
            await import("../src/components/options/DynamicSponsorRegexManagerComponent")
        ).default;

        const markup = renderToStaticMarkup(React.createElement(DynamicSponsorRegexManagerComponent));

        expect(markup).toContain("Shopping Sites");
        expect(markup).toContain("Food Delivery");

        for (const flag of ["g", "i", "m", "s", "u"]) {
            expect(markup).toContain(`id="sponsorRegexFlag_${flag}"`);
        }

        expect(markup).toContain("dynamicSponsorRegexConfigSourceBuiltin");

        expect(markup).toContain("2025-10-17");

        expect(markup).toContain("dynamicSponsorRegexRuleReset");
        expect(markup).not.toContain("dynamicSponsorRegexRuleDelete");
        expect(markup).not.toContain("data-rule-name");

        expect(markup).not.toContain("dynamicSponsorRegexRuleNamePlaceholder");
        // 同时统计已选 flags 和已启用规则。
        expect(markup.match(/type="checkbox" checked=""/g) ?? []).toHaveLength(12);
    });

    test("重复 id 展示用户版本，自建词条排在最后", async () => {
        const Config = (await import("../src/config")).default;
        Config.config.dynamicAndCommentSponsorRegexUserRules = [
            { id: "shoppingSite", pattern: "用户改的", enabled: false },
            { id: "custom_1", name: "我的词条", pattern: "某某产品", enabled: true },
        ];
        Config.local.sponsorRegexRemoteConfig = {
            rules: [{ id: "shoppingSite", pattern: "在线新模式", enabled: true, version: 2 }],
        };

        const DynamicSponsorRegexManagerComponent = (
            await import("../src/components/options/DynamicSponsorRegexManagerComponent")
        ).default;

        const markup = renderToStaticMarkup(React.createElement(DynamicSponsorRegexManagerComponent));

        expect(markup).toContain('value="用户改的"');
        expect(markup).toContain('value="某某产品"');
        expect(markup).toContain("data-rule-name");
        expect(markup).toContain("dynamicSponsorRegexRuleDelete");
    });
});
