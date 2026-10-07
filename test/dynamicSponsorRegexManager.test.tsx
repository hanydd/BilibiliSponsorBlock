/** @jest-environment jsdom */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mockDefaultRules = [
    { id: "shoppingSite", pattern: "(?:淘宝|京东)搜索", enabled: true },
    { id: "delivery", pattern: "美团外卖", enabled: false },
];

jest.mock("../src/config", () => ({
    __esModule: true,
    default: {
        config: {
            dynamicAndCommentSponsorRegexRules: mockDefaultRules,
            dynamicAndCommentSponsorRegexFlags: "gi",
        },
        syncDefaults: { dynamicAndCommentSponsorRegexRules: mockDefaultRules },
    },
}));

describe("DynamicSponsorRegexManagerComponent", () => {
    beforeEach(() => {
        (global as unknown as { chrome: unknown }).chrome = {
            i18n: { getMessage: (key: string) => key },
        };
    });

    test("渲染内置词条、启用状态与匹配模式", async () => {
        const DynamicSponsorRegexManagerComponent = (
            await import("../src/components/options/DynamicSponsorRegexManagerComponent")
        ).default;

        const markup = renderToStaticMarkup(React.createElement(DynamicSponsorRegexManagerComponent));

        expect(markup).toContain("dynamicSponsorRuleName_shoppingSite");
        expect(markup).toContain("dynamicSponsorRuleName_delivery");

        // 匹配模式 = 正则 flags（g/i/m/s/u）
        for (const flag of ["g", "i", "m", "s", "u"]) {
            expect(markup).toContain(`id="sponsorRegexFlag_${flag}"`);
        }
        expect(markup).not.toContain("#sponsorRegexMatchMode");

        // 内置词条只能重置，不能删除
        expect(markup).toContain("dynamicSponsorRegexRuleReset");
        expect(markup).not.toContain("dynamicSponsorRegexRuleDelete");

        // 内置词条名不可编辑，启用状态跟随配置
        expect(markup).not.toContain("dynamicSponsorRegexRuleNamePlaceholder");
        expect(markup.match(/type="checkbox" checked=""/g) ?? []).toHaveLength(3); // g + i + shoppingSite
    });
});
