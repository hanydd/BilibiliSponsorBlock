/** @jest-environment jsdom */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mockDefaultRules = [
    {
        id: "shoppingSite",
        locales: { en: "Shopping Sites", zh_CN: "购物网站" },
        pattern: "(?:淘宝|京东)搜索",
        enabled: true,
        version: 1,
        updateAt: { year: 2026, month: 10, day: 7 },
    },
    {
        id: "delivery",
        locales: { en: "Food Delivery", zh_CN: "外卖" },
        pattern: "美团外卖",
        enabled: false,
        version: 1,
        updateAt: { year: 2026, month: 10, day: 7 },
    },
];

jest.mock("../src/config", () => ({
    __esModule: true,
    default: {
        config: {
            dynamicAndCommentSponsorRegexRules: mockDefaultRules,
            dynamicAndCommentSponsorRegexFlags: "gi",
        },
        local: { sponsorRegexRemoteConfig: null },
        syncDefaults: { dynamicAndCommentSponsorRegexRules: mockDefaultRules },
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

    test("渲染内置词条、启用状态、匹配模式与来源状态", async () => {
        const DynamicSponsorRegexManagerComponent = (
            await import("../src/components/options/DynamicSponsorRegexManagerComponent")
        ).default;

        const markup = renderToStaticMarkup(React.createElement(DynamicSponsorRegexManagerComponent));

        // 词条名来自配置自带的 locales（测试浏览器 UI 语言为 en-US）
        expect(markup).toContain("Shopping Sites");
        expect(markup).toContain("Food Delivery");

        // 匹配模式 = 正则 flags（g/i/m/s/u）
        for (const flag of ["g", "i", "m", "s", "u"]) {
            expect(markup).toContain(`id="sponsorRegexFlag_${flag}"`);
        }

        // 未应用在线配置时展示内置来源
        expect(markup).toContain("dynamicSponsorRegexConfigSourceBuiltin");

        // 每条词条展示自己的更新日期
        expect(markup).toContain("2026-10-07");

        // 内置词条只能重置，不能删除
        expect(markup).toContain("dynamicSponsorRegexRuleReset");
        expect(markup).not.toContain("dynamicSponsorRegexRuleDelete");

        // 内置词条名不可编辑，启用状态跟随配置
        expect(markup).not.toContain("dynamicSponsorRegexRuleNamePlaceholder");
        expect(markup.match(/type="checkbox" checked=""/g) ?? []).toHaveLength(3); // g + i + shoppingSite
    });
});
