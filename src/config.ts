import * as CompileConfig from "../config.json";
import * as DefaultBackendConfig from "../backends.json";
import {
    Category,
    CategorySelection,
    CategorySkipOption,
    NoticeVisibilityMode,
    PreviewBarOption,
    SponsorTime,
    BVID,
    CID,
    SponsorHideType,
    DynamicSponsorSelection,
    DynamicSponsorOption,
    HideFullVideoLabels,
    WhitelistedChannel,
} from "./types";
import { Keybind, ProtoConfig, keybindEquals } from "./config/config";
import { getMigratedMirrorServerAddresses } from "./config/serverConfig";
import { HashedValue } from "./utils/hash";

export interface BackendConfigStorageDefinition {
    id: string;
    name: string;
    desc?: string;
    api_url: string;
    capabilities: string[];
    match?: unknown[];
    mirrors?: string[];
    conflicts?: string[];
}

export interface BackendConfigStorageDocument {
    backends: BackendConfigStorageDefinition[];
}

export interface BackendSubscriptionStorage {
    url: string;
    intervalMinutes: number;
    enabled: boolean;
    lastSyncAt: number | null;
    lastError: string | null;
}

export interface Permission {
    canSubmit: boolean;
}

interface SBConfig {
    userID: string;
    isVip: boolean;
    permissions: Record<Category, Permission>;
    defaultCategory: Category;
    renderSegmentsAsChapters: boolean;
    whitelistedChannels: WhitelistedChannel[];
    forceChannelCheck: boolean;
    minutesSaved: number;
    skipCount: number;
    sponsorTimesContributed: number;
    submissionCountSinceCategories: number; // New count used to show the "Read The Guidelines!!" message
    showTimeWithSkips: boolean;
    disableSkipping: boolean;
    enableDanmakuSkip: boolean;
    enableAutoSkipDanmakuSkip: boolean;
    enableMenuDanmakuSkip: boolean;
    danmakuOffsetMatchingRegexPattern: string;
    checkTimeDanmakuSkip: boolean;
    muteSegments: boolean;
    fullVideoSegments: boolean;
    fullVideoLabelsOnThumbnailsMode: number;
    manualSkipOnFullVideo: boolean;
    trackViewCount: boolean;
    trackViewCountInPrivate: boolean;
    trackDownvotes: boolean;
    trackDownvotesInPrivate: boolean;
    dontShowNotice: boolean;
    noticeVisibilityMode: NoticeVisibilityMode;
    hideVideoPlayerControls: boolean;
    hideInfoButtonPlayerControls: boolean;
    hideDeleteButtonPlayerControls: boolean;
    hideUploadButtonPlayerControls: boolean;
    hideSkipButtonPlayerControls: boolean;
    hideDiscordLaunches: number;
    hideDiscordLink: boolean;
    invidiousInstances: string[];
    serverAddress: string;
    mirrorServerAddresses: string[];
    minDuration: number;
    skipNoticeDuration: number;
    skipNoticeDurationBefore: number;
    advanceSkipNotice: boolean;
    audioNotificationOnSkip: boolean;
    checkForUnlistedVideos: boolean;
    testingServer: boolean;
    ytInfoPermissionGranted: boolean;
    allowExperiments: boolean;
    showDonationLink: boolean;
    showPopupDonationCount: number;
    showNewFeaturePopups: boolean;
    donateClicked: number;
    autoHideInfoButton: boolean;
    autoSkipOnMusicVideos: boolean;
    colorPalette: {
        red: string;
        white: string;
        locked: string;
    };
    scrollToEditTimeUpdate: boolean;
    categoryPillUpdate: boolean;
    showChapterInfoMessage: boolean;
    darkMode: boolean;
    showCategoryGuidelines: boolean;
    showShortcutPopover: boolean;
    showCategoryWithoutPermission: boolean;
    showSegmentNameInChapterBar: boolean;
    useVirtualTime: boolean;
    skipOnSeekToSegment: boolean;
    showSegmentFailedToFetchWarning: boolean;
    allowScrollingToEdit: boolean;
    showPreviewYoutubeButton: boolean;
    showPortVideoButton: boolean;
    cleanPopup: boolean;
    enableCache: boolean;
    lifecycleDebug: boolean;

    dynamicAndCommentSponsorWhitelistedChannels: boolean;
    dynamicAndCommentSponsorBlocker: boolean;
    dynamicAndCommentSponsorRegexPattern: string;
    dynamicAndCommentSponsorRegexPatternKeywordNumber: number;
    dynamicSponsorBlock: boolean;
    dynamicSponsorBlockerDebug: boolean;
    dynamicSpaceSponsorBlocker: boolean;
    commentSponsorBlock: boolean;
    commentSponsorReplyBlock: boolean;

    showNewIcon: boolean;

    // Used to cache calculated text color info
    categoryPillColors: {
        [key in Category]: {
            lastColor: string;
            textColor: string;
        };
    };

    skipKeybind: Keybind;
    skipToHighlightKeybind: Keybind;
    startSponsorKeybind: Keybind;
    submitKeybind: Keybind;
    actuallySubmitKeybind: Keybind;
    previewKeybind: Keybind;
    nextFrameKeybind: Keybind;
    previousFrameKeybind: Keybind;
    closeSkipNoticeKeybind: Keybind;

    // What categories should be skipped
    categorySelections: CategorySelection[];

    // Preview bar
    barTypes: {
        "preview-chooseACategory": PreviewBarOption;
        "sponsor": PreviewBarOption;
        "preview-sponsor": PreviewBarOption;
        "selfpromo": PreviewBarOption;
        "preview-selfpromo": PreviewBarOption;
        "exclusive_access": PreviewBarOption;
        "interaction": PreviewBarOption;
        "preview-interaction": PreviewBarOption;
        "intro": PreviewBarOption;
        "preview-intro": PreviewBarOption;
        "outro": PreviewBarOption;
        "preview-outro": PreviewBarOption;
        "preview": PreviewBarOption;
        "preview-preview": PreviewBarOption;
        "music_offtopic": PreviewBarOption;
        "preview-music_offtopic": PreviewBarOption;
        "poi_highlight": PreviewBarOption;
        "preview-poi_highlight": PreviewBarOption;
        "filler": PreviewBarOption;
        "preview-filler": PreviewBarOption;
    };


    //动态主页UP主贴片广告
    dynamicSponsorSelections: DynamicSponsorSelection[];
    dynamicSponsorTypes: {
        "dynamicSponsor_sponsor": PreviewBarOption;
        "dynamicSponsor_forward_sponsor": PreviewBarOption;
        "dynamicSponsor_suspicion_sponsor": PreviewBarOption;
    };
}

export type VideoDownvotes = { segments: { uuid: HashedValue; hidden: SponsorHideType }[]; lastAccess: number };

interface SBStorage {
    /* VideoID prefixes to UUID prefixes */
    downvotedSegments: Record<BVID & HashedValue, VideoDownvotes>;
    navigationApiAvailable: boolean;

    // Used when sync storage disabled
    alreadyInstalled: boolean;

    /* Contains unsubmitted segments that the user has created. */
    unsubmittedSegments: Record<string, SponsorTime[]>;

    // 未提交片段对应稿件的 CID 映射集合，用于跨上下文共享
    videoPageCidMap: Record<BVID, Record<string, CID>>;

    backendConfig: BackendConfigStorageDocument;
    backendEnabledMap: Record<string, boolean>;
    backendSubscription: BackendSubscriptionStorage;
    lastSubmissionBackendId: string | null;
}

class ConfigClass extends ProtoConfig<SBConfig, SBStorage> {
    resetToDefault() {
        chrome.storage.sync.set({
            ...this.syncDefaults,
            userID: this.config.userID,
            minutesSaved: this.config.minutesSaved,
            skipCount: this.config.skipCount,
            sponsorTimesContributed: this.config.sponsorTimesContributed,
        });

        chrome.storage.local.set({
            ...this.localDefaults,
        });
    }
}

function migrateOldSyncFormats(config: SBConfig, initialSyncKeys: ReadonlySet<string>) {
    // Unbind key if it matches a previous one set by the user (should be ordered oldest to newest)
    const keybinds = ["skipKeybind", "startSponsorKeybind", "submitKeybind"];
    for (let i = keybinds.length - 1; i >= 0; i--) {
        for (let j = 0; j < keybinds.length; j++) {
            if (i == j) continue;
            if (keybindEquals(config[keybinds[i]], config[keybinds[j]])) config[keybinds[i]] = null;
        }
    }

    // move to new server endpoint v0.1.8
    if (config["serverAddress"].includes("47.103.74.95")) {
        config["serverAddress"] = CompileConfig.serverAddress;
    }

    // move back to the server endpoint v0.8.2
    if (config["serverAddress"].includes("115.190.32.254")) {
        config["serverAddress"] = CompileConfig.serverAddress;
    }

    const migratedMirrorServerAddresses = getMigratedMirrorServerAddresses(
        config["serverAddress"],
        config["mirrorServerAddresses"],
        initialSyncKeys.has("mirrorServerAddresses")
    );
    if (migratedMirrorServerAddresses !== config["mirrorServerAddresses"]) {
        config["mirrorServerAddresses"] = migratedMirrorServerAddresses;
    }

    // "danmakuRegexPattern" 在 0.6.0 版本中被移除，
    // 取而代之的是 "danmakuTimeMatchingRegexPattern" 和 "danmakuOffsetMatchingRegexPattern"
    delete config["danmakuRegexPattern"];

    //"danmakuTimeMatchingRegexPattern" 在 0.6.1 版本中被移除（预计）
    delete config["danmakuTimeMatchingRegexPattern"];

    // 更新默认的弹幕偏移匹配正则表达式
    const oldDanmakuOffsetMatchingRegexPatterns = [
        "(?:^|(右|右滑|按|右下|右向|右方向|→|⇒|⇢|⇨|⮕|🡆|🠺|🠾|🢒|👉))(\\d+)(下|次)?$", // 0.6.0
    ];
    if (oldDanmakuOffsetMatchingRegexPatterns.includes(config["danmakuOffsetMatchingRegexPattern"])) {
        config["danmakuOffsetMatchingRegexPattern"] = syncDefaults.danmakuOffsetMatchingRegexPattern;
    }

    // 更新默认动态贴片广告正则表达式 在0.8.1额外迁移变量
    const oldDynamicSponsorRegexPattern = [
        "(618|11(?!1).11|双(11|十一|12|十二))|恰(?:个|了|到)?饭|((领(?:取)?|抢|有)(?:神|优惠)?券|券后)|(淘宝|京东|拼多多)搜索|(点(?:击)|戳|来|我)评论区(?:置顶)|(立即|蓝链)(?:购买|下单)|满\\d+|(大促|促销)|折扣|特价|秒杀|广告|低至|热卖|抢购|新品|豪礼|赠品", // 0.7.4
        "(618|11(?!1).11|双(11|十一|12|十二))|(恰|接)(?:个|了|到)?(饭|广)|((?:领(?:取|张)?|抢|有)(?:神|优惠)?(券|卷)|券后|卷后)|(淘宝|京东|拼多多)搜索|(点(?:击)|戳|来|我)评论区(?:置顶)|(立即|蓝链)(?:购买|下单)|满\\d+|(大促|促销)|折扣|特价|秒杀|广告|低至|热卖|抢购|新品|豪礼|赠品|同款", // 0.8.1
        "/(618|11(?!1).11|双(?:11|十一|12|十二)|女神节)|恰(?:个|了|到)?饭|金主|(?:评论区)?(?:领(?:取|张|到)?|抢|有|送|得)(?:我的)?(?:神|优惠|红包|折扣|福利|无门槛|隐藏|秘密|专属|(?:超)?大(?:额)?|额外)*(?:券|卷|劵|q(?:uan)?)?(?:后|到手|价|使用|下单)?|(?:优惠|(?:券|卷|劵)后|到手|促销|活动|神)价|(?:淘宝|tb|京东|jd|狗东|拼多多|pdd|天猫|tmall)搜索|(?:随(便|时)|任意)(?:退|退货|换货)|(?:免费|无偿)(?:换(?:个)?新|替换|更换)(?:商品|物品)?|(?:点(?:击)?|戳|来|我)评论区(?:置顶)?|(?:立即|蓝链|链接|🔗)(?:购买|下单)|(?:vx|wx|微信|软件)扫码(?:领)?(?:优惠|红包|券)?|(?:我的)?同款(?:[的]?(?:推荐|好物|商品|入手|购买|拥有|分享|安利)?)|满\\d+|大促|促销|折扣|特价|秒杀|广告|推广|低至|热卖|抢购|新品|豪礼|赠品/gi", // 0.11.1
    ];
    if (config["dynamicSponsorRegexPattern"] && !config["dynamicAndCommentSponsorRegexPattern"]) {
        config["dynamicAndCommentSponsorRegexPattern"] = config["dynamicSponsorRegexPattern"];
        delete config["dynamicSponsorRegexPattern"];
    }
    if (oldDynamicSponsorRegexPattern.includes(config["dynamicAndCommentSponsorRegexPattern"])) {
        config["dynamicAndCommentSponsorRegexPattern"] = syncDefaults.dynamicAndCommentSponsorRegexPattern;
    }

    // Migrate whitelistedChannels from string[] to WhitelistedChannel[]
    if (config["whitelistedChannels"] && config["whitelistedChannels"].length > 0) {
        // Check if it's the old format (string array)
        if (typeof config["whitelistedChannels"][0] === "string") {
            config["whitelistedChannels"] = (config["whitelistedChannels"] as unknown as string[]).map((id) => ({
                id,
                name: chrome.i18n.getMessage("whitelistUnknownUploader") || "Unknown UP",
            }));
        }
    }

    //动态贴片设置变量名迁移 // 0.8.1
    if (config["dynamicSponsorBlocker"]) {
        config["dynamicAndCommentSponsorBlocker"] = config["dynamicSponsorBlocker"];
        delete config["dynamicSponsorBlocker"];
    }
    if (config["dynamicSponsorWhitelistedChannels"]) {
        config["dynamicAndCommentSponsorWhitelistedChannels"] = config["dynamicSponsorWhitelistedChannels"];
        delete config["dynamicSponsorWhitelistedChannels"];
    }
    //当整个视频都是某一类别时操作选项迁移
    if (config["fullVideoLabelsOnThumbnails"]) {
        if (config["fullVideoLabelsOnThumbnails"] === true) {
            config["fullVideoLabelsOnThumbnailsMode"] = HideFullVideoLabels.Overlay;
        } else {
            config["fullVideoLabelsOnThumbnailsMode"] = HideFullVideoLabels.Disabled;
        }
        //fullVideoLabelsOnThumbnails被移除 0.9.2
        delete config["fullVideoLabelsOnThumbnails"];
    }
}

const syncDefaults = {
    userID: null,
    isVip: false,
    permissions: {},
    defaultCategory: "chooseACategory" as Category,
    renderSegmentsAsChapters: false,
    whitelistedChannels: [],
    forceChannelCheck: false,
    minutesSaved: 0,
    skipCount: 0,
    sponsorTimesContributed: 0,
    submissionCountSinceCategories: 0,
    showTimeWithSkips: true,
    disableSkipping: false,

    // danmaku skip
    enableDanmakuSkip: false,
    enableAutoSkipDanmakuSkip: false,
    enableMenuDanmakuSkip: false,
    danmakuOffsetMatchingRegexPattern: "(?:^|(右|右滑|按|右下|右向|右方向|→|⇒|⇢|⇨|⮕|🡆|🠺|🠾|🢒|👉))(\\d+)(下|次)?",
    checkTimeDanmakuSkip: true,

    muteSegments: true,
    fullVideoSegments: true,
    fullVideoLabelsOnThumbnailsMode: HideFullVideoLabels.Overlay,
    manualSkipOnFullVideo: false,
    trackViewCount: true,
    trackViewCountInPrivate: true,
    trackDownvotes: true,
    trackDownvotesInPrivate: false,
    dontShowNotice: false,
    noticeVisibilityMode: NoticeVisibilityMode.FadedForAutoSkip,
    hideVideoPlayerControls: false,
    hideInfoButtonPlayerControls: false,
    hideDeleteButtonPlayerControls: false,
    hideUploadButtonPlayerControls: false,
    hideSkipButtonPlayerControls: false,
    hideDiscordLaunches: 0,
    hideDiscordLink: false,
    invidiousInstances: ["invidious.snopyta.org"], // leave as default
    serverAddress: CompileConfig.serverAddress,
    mirrorServerAddresses: CompileConfig.mirrorServerAddresses,
    minDuration: 0,
    skipNoticeDuration: 4,
    skipNoticeDurationBefore: 3,
    advanceSkipNotice: false,
    audioNotificationOnSkip: false,
    checkForUnlistedVideos: false,
    testingServer: false,
    ytInfoPermissionGranted: false,
    allowExperiments: true,
    showDonationLink: true,
    showPopupDonationCount: 0,
    showNewFeaturePopups: true,
    donateClicked: 0,
    autoHideInfoButton: true,
    autoSkipOnMusicVideos: false,
    scrollToEditTimeUpdate: false, // false means the tooltip will be shown
    categoryPillUpdate: false,
    showChapterInfoMessage: true,
    darkMode: true,
    showCategoryGuidelines: true,
    showShortcutPopover: true,
    showCategoryWithoutPermission: false,
    showSegmentNameInChapterBar: true,
    useVirtualTime: true,
    skipOnSeekToSegment: true,
    showSegmentFailedToFetchWarning: true,
    allowScrollingToEdit: true,
    showPreviewYoutubeButton: true,
    showPortVideoButton: true,
    cleanPopup: false,
    enableCache: true,
    lifecycleDebug: false,

    dynamicAndCommentSponsorWhitelistedChannels: false,
    dynamicAndCommentSponsorBlocker: false,
    dynamicAndCommentSponsorRegexPattern:
    "/" +
    "618|11(?!1).11(?:日)?|双(?:11|十一|12|十二)|女神节|开学季|年货节|" + // 购物节日
    "恰(?:个|了|到)?饭|金主|(他|它|她)(?:们)?家(?:的)?|" + // 广告
    "(?:评论区)?(?:领(?:取|张|到)?|抢|送|得|叠)(?:我的)?(?:神|优惠|红包|折扣|福利|无门槛|隐藏|秘密|专属|(?:超)?大(?:额)?|额外)+(?:券|卷|劵|q(?:uan)?)?(?:后|到手|价|使用|下单)?|(?:领|抢|得|送)(?:红包|优惠|券|福利)|(?:优惠|(?:券|卷|劵)后|到手|促销|活动|神)价|" + // 优惠券类
    "(?:淘宝|tb|京东|jd|狗东|拼多多|pdd|天猫|tmall)搜索|" + //购物软件
    "(?:随(便|时)|任意)(?:退|退货|换货)|(?:免费|无偿)(?:换(?:个)?新|替换|更换|试用)(?:商品|物品)?|" + //退换货承诺
    "(?:点(?:击)?|戳|来|我)评论区(?:置顶)?|(?:立即|蓝链|链接|🔗)(?:购买|下单)|" + // 购买链接
    "(?:vx|wx|微信|软件)扫码(?:领)?(?:优惠|红包|券)?|" + //引导
    "(?:我的)?同款(?:[的]?(?:推荐|好物|商品|入手|购买|拥有|分享|安利)?)|" + //同款
    "满\\d+|大促|促销|折扣|特价|秒杀|广告|推广|低至|热卖|抢购|新品|豪礼|赠品|密令|" + //杂项
    "(?:饿了么|美(?:团|団)|百度外卖|蜂鸟|达达|UU跑腿|(?:淘宝)?闪购)|(?:点|订|送|吃)(?:外卖|餐)|外卖(?:节|服务|平台|app)" + //外卖大战
    "/gi" //匹配参数
    ,
    dynamicAndCommentSponsorRegexPatternKeywordNumber: 1,
    dynamicSponsorBlock: true,
    dynamicSponsorBlockerDebug: false,
    dynamicSpaceSponsorBlocker: false,
    commentSponsorBlock: true,
    commentSponsorReplyBlock: false,

    showNewIcon: true,

    categoryPillColors: {},

    /**
     * Default keybinds should not set "code" as that's gonna be different based on the user's locale. They should also only use EITHER ctrl OR alt modifiers (or none).
     * Using ctrl+alt, or shift may produce a different character that we will not be able to recognize in different locales.
     * The exception for shift is letters, where it only capitalizes. So shift+A is fine, but shift+1 isn't.
     * Don't forget to add the new keybind to the checks in "KeybindDialogComponent.isKeybindAvailable()" and in "migrateOldFormats()"!
     *      TODO: Find a way to skip having to update these checks. Maybe storing keybinds in a Map?
     */
    skipKeybind: { key: "Enter" },
    skipToHighlightKeybind: { key: "Enter", ctrl: true },
    startSponsorKeybind: { key: ";" },
    submitKeybind: { key: "'" },
    actuallySubmitKeybind: { key: "'", ctrl: true },
    previewKeybind: { key: ";", ctrl: true },
    nextFrameKeybind: { key: "." },
    previousFrameKeybind: { key: "," },
    closeSkipNoticeKeybind: { key: "Backspace" },

    categorySelections: [
        {
            name: "sponsor" as Category,
            option: CategorySkipOption.AutoSkip,
        },
        {
            name: "selfpromo" as Category,
            option: CategorySkipOption.ManualSkip,
        },
        {
            name: "interaction" as Category,
            option: CategorySkipOption.ManualSkip,
        },
        {
            name: "intro" as Category,
            option: CategorySkipOption.ManualSkip,
        },
        {
            name: "outro" as Category,
            option: CategorySkipOption.ManualSkip,
        },
        {
            name: "preview" as Category,
            option: CategorySkipOption.ShowOverlay,
        },
        {
            name: "padding" as Category,
            option: CategorySkipOption.AutoSkip,
        },
        {
            name: "music_offtopic" as Category,
            option: CategorySkipOption.AutoSkip,
        },
        {
            name: "poi_highlight" as Category,
            option: CategorySkipOption.ManualSkip,
        },
        {
            name: "exclusive_access" as Category,
            option: CategorySkipOption.ShowOverlay,
        },
    ],

    colorPalette: {
        red: "#780303",
        white: "#ffffff",
        locked: "#ffc83d",
    },

    // Preview bar
    barTypes: {
        "preview-chooseACategory": {
            color: "#ffffff",
            opacity: "0.7",
        },
        sponsor: {
            color: "#00d400",
            opacity: "0.7",
        },
        "preview-sponsor": {
            color: "#007800",
            opacity: "0.7",
        },
        selfpromo: {
            color: "#ffff00",
            opacity: "0.7",
        },
        "preview-selfpromo": {
            color: "#bfbf35",
            opacity: "0.7",
        },
        exclusive_access: {
            color: "#008a5c",
            opacity: "0.7",
        },
        interaction: {
            color: "#cc00ff",
            opacity: "0.7",
        },
        "preview-interaction": {
            color: "#6c0087",
            opacity: "0.7",
        },
        intro: {
            color: "#00ffff",
            opacity: "0.7",
        },
        "preview-intro": {
            color: "#008080",
            opacity: "0.7",
        },
        outro: {
            color: "#0202ed",
            opacity: "0.7",
        },
        "preview-outro": {
            color: "#000070",
            opacity: "0.7",
        },
        preview: {
            color: "#008fd6",
            opacity: "0.7",
        },
        "preview-preview": {
            color: "#005799",
            opacity: "0.7",
        },
        music_offtopic: {
            color: "#ff9900",
            opacity: "0.7",
        },
        "preview-music_offtopic": {
            color: "#a6634a",
            opacity: "0.7",
        },
        poi_highlight: {
            color: "#ff1684",
            opacity: "0.7",
        },
        "preview-poi_highlight": {
            color: "#9b044c",
            opacity: "0.7",
        },
        filler: {
            color: "#7300FF",
            opacity: "0.9",
        },
        "preview-filler": {
            color: "#2E0066",
            opacity: "0.7",
        },
        padding: {
            color: "#222222",
            opacity: "0.7",
        },
        "preview-padding": {
            color: "#111111",
            opacity: "0.7",
        },
    },

    //动态主页UP主贴片广告
    dynamicSponsorSelections: [
        {
            name: "dynamicSponsor_sponsor" as Category,
            option: DynamicSponsorOption.Hide,
        },
        {
            name: "dynamicSponsor_forward_sponsor" as Category,
            option: DynamicSponsorOption.Hide,
        },
        {
            name: "dynamicSponsor_suspicion_sponsor" as Category,
            option: DynamicSponsorOption.Disabled,
        },
    ],
    dynamicSponsorTypes: {
        dynamicSponsor_sponsor: {
            color: "#007800",
            opacity: "0.7",
        },
        dynamicSponsor_forward_sponsor: {
            color: "#bfbf35",
            opacity: "0.7",
        },
        dynamicSponsor_suspicion_sponsor: {
            color: "#a6634a",
            opacity: "0.7",
        },
    }
};

const localDefaults = {
    downvotedSegments: {},
    navigationApiAvailable: null,
    alreadyInstalled: false,
    unsubmittedSegments: {},
    videoPageCidMap: {},
    backendConfig: JSON.parse(JSON.stringify(DefaultBackendConfig)) as BackendConfigStorageDocument,
    backendEnabledMap: Object.fromEntries(
        (DefaultBackendConfig.backends ?? []).map((backend) => [backend.id, true])
    ) as Record<string, boolean>,
    backendSubscription: {
        url: "",
        intervalMinutes: 60,
        enabled: false,
        lastSyncAt: null,
        lastError: null,
    },
    lastSubmissionBackendId: null,
};

const Config = new ConfigClass(syncDefaults, localDefaults, migrateOldSyncFormats);
export default Config;
