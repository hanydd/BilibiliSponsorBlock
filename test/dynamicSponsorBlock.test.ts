/** @jest-environment jsdom */
import { DynamicSponsorOption } from "../src/types";

jest.mock("../src/config", () => ({ __esModule: true, default: { config: {}, local: {} } }));
jest.mock("../src/thumbnail-utils/thumbnails", () => ({ insertSBIconDefinition: jest.fn() }));
jest.mock("../src/utils/cleanup", () => ({ addCleanupListener: jest.fn() }));

let Config: typeof import("../src/config").default;
let DynamicListener: typeof import("../src/render/DynamicAndCommentSponsorBlock").DynamicListener;

/** 命中两个关键词才算达到阈值（设置项 dynamicAndCommentSponsorRegexPatternKeywordNumber） */
const KEYWORD_THRESHOLD = 2;

/** 动态列表与顶部导航栏要先存在，DynamicListener 才会开始观察 */
function fixture(): HTMLElement {
    document.body.innerHTML = `
        <div class="bili-dyn-up-list__content"></div>
        <div class="bili-dyn-list__items"></div>`;

    return document.querySelector(".bili-dyn-list__items");
}

function makeDynamic(text: string): HTMLElement {
    const item = document.createElement("div");
    item.innerHTML = `
        <div class="bili-dyn-item__avatar" bilisponsor-userid="up1"></div>
        <div class="bili-dyn-title__text"></div>
        <div class="bili-rich-text__content"><span>${text}</span></div>
        <div class="bili-dyn-content"></div>
        <div class="bili-dyn-item__action"></div>
        <div class="bili-dyn-item__action"></div>
        <div class="bili-dyn-item__action"></div>`;

    return item;
}

/** 让 DynamicListener 的 await 与 MutationObserver 回调跑完 */
async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function observeDynamic(list: HTMLElement, text: string): Promise<HTMLElement> {
    const item = makeDynamic(text);
    list.appendChild(item);
    await settle();

    return item;
}

function getLabel(item: HTMLElement): Element | null {
    return item.querySelector("#dynamicSponsorLabel");
}

function getContent(item: HTMLElement): HTMLElement {
    return item.querySelector(".bili-dyn-content");
}

beforeEach(async () => {
    jest.resetModules();
    Config = (await import("../src/config")).default;
    ({ DynamicListener } = await import("../src/render/DynamicAndCommentSponsorBlock"));

    (global as unknown as { chrome: unknown }).chrome = {
        i18n: { getMessage: (key: string) => key },
    };

    Object.assign(Config.config, {
        dynamicAndCommentSponsorRegexFlags: "gi",
        dynamicAndCommentSponsorRegexPatternKeywordNumber: KEYWORD_THRESHOLD,
        dynamicAndCommentSponsorRegexUserRules: [],
        dynamicSponsorBlockerDebug: false,
        dynamicSponsorSelections: [
            { name: "dynamicSponsor_suspicion_sponsor", option: DynamicSponsorOption.Hide },
        ],
        dynamicAndCommentSponsorWhitelistedChannels: false,
        whitelistedChannels: [],
        dynamicSpaceSponsorBlocker: false,
    });
    Config.local.sponsorRegexRemoteConfig = {
        rules: [
            {
                id: "promo",
                locales: { en: "Promo" },
                pattern: "秒杀|折扣",
                enabled: true,
                version: 1,
                updateAt: { year: 2026, month: 10, day: 8 },
            },
        ],
    };
});

afterEach(() => {
    document.body.replaceChildren();
});

test("少于阈值时只添加标签，不隐藏内容", async () => {
    const list = fixture();
    void DynamicListener();
    await settle();

    const item = await observeDynamic(list, "全场秒杀");

    expect(getLabel(item)).not.toBeNull();
    expect(getContent(item).style.display).toBe("");
});

test("达到阈值时添加标签并隐藏内容", async () => {
    const list = fixture();
    void DynamicListener();
    await settle();

    const item = await observeDynamic(list, "全场秒杀 大折扣");

    expect(getLabel(item)).not.toBeNull();
    expect(getContent(item).style.display).toBe("none");
});

test("没有命中关键词时不添加标签", async () => {
    const list = fixture();
    void DynamicListener();
    await settle();

    const item = await observeDynamic(list, "今天天气不错");

    expect(getLabel(item)).toBeNull();
    expect(getContent(item).style.display).toBe("");
});

test("停用的词条不参与匹配", async () => {
    Config.local.sponsorRegexRemoteConfig = {
        rules: [{ ...Config.local.sponsorRegexRemoteConfig.rules[0], enabled: false }],
    };
    const list = fixture();
    void DynamicListener();
    await settle();

    const item = await observeDynamic(list, "全场秒杀 大折扣");

    expect(getLabel(item)).toBeNull();
});
