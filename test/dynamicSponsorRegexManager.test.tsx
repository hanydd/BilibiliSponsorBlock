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
        // 未应用在线配置：默认词条取自随包的 config/sponsorRegex.json
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

        // 词条名来自默认词条自带的 locales（测试浏览器 UI 语言为 en-US）
        expect(markup).toContain("Shopping Sites");
        expect(markup).toContain("Food Delivery");

        // 匹配模式 = 正则 flags（g/i/m/s/u）
        for (const flag of ["g", "i", "m", "s", "u"]) {
            expect(markup).toContain(`id="sponsorRegexFlag_${flag}"`);
        }

        // 未应用在线配置时展示内置来源
        expect(markup).toContain("dynamicSponsorRegexConfigSourceBuiltin");

        // 每条词条展示自己的更新日期（取自随包配置 config/sponsorRegex.json）
        expect(markup).toContain("2025-10-17");

        // 内置词条内容可编辑、可以重置，但不能删除
        expect(markup).toContain("dynamicSponsorRegexRuleReset");
        expect(markup).not.toContain("dynamicSponsorRegexRuleDelete");
        expect(markup).not.toContain("data-rule-name");

        // 默认词条名不可编辑；启用状态 = 2 个 flags + 全部默认词条
        expect(markup).not.toContain("dynamicSponsorRegexRuleNamePlaceholder");
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

        // 用户版本的内容与启用状态优先，自建词条可编辑名称
        expect(markup).toContain('value="用户改的"');
        expect(markup).toContain('value="某某产品"');
        expect(markup).toContain("data-rule-name");
        expect(markup).toContain("dynamicSponsorRegexRuleDelete");
    });
});
