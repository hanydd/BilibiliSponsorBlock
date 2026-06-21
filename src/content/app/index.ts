import { CommandBus } from "./commandBus";
import { EventBus } from "./eventBus";
import { ContentStore } from "./store";
import { createContentTrace } from "./trace";
import { ContentCommandMap, ContentAppState, ContentEventMap } from "./types";
import { ContentUIRegistry } from "./uiRegistry";
import { PageType } from "../../types";

const initialContentState: ContentAppState = {
    sponsorDataFound: false,
    sponsorTimes: [],
    skipNotices: [],
    advanceSkipNotices: null,
    activeSkipKeybindElement: null,
    shownSegmentFailedToFetchWarning: false,
    previewedSegment: false,
    portVideo: null,
    videoInfo: null,
    lockedCategories: [],
    switchingVideos: null,
    channelWhitelisted: false,
    sponsorTimesSubmitting: [],
    lastResponseStatus: 0,
    pageLoaded: false,
    pageType: PageType.Unknown,
    pageUrl: "",
};

export interface ContentApp {
    bus: EventBus<ContentEventMap>;
    commands: CommandBus<ContentCommandMap>;
    store: ContentStore<ContentAppState>;
    ui: ContentUIRegistry;
}

let currentContentApp: ContentApp | null = null;

export function createContentApp(): ContentApp {
    const trace = createContentTrace();

    currentContentApp = {
        bus: new EventBus<ContentEventMap>(trace),
        commands: new CommandBus<ContentCommandMap>(trace),
        store: new ContentStore<ContentAppState>(initialContentState),
        ui: new ContentUIRegistry(),
    };

    return currentContentApp;
}

export function getContentApp(): ContentApp {
    if (!currentContentApp) {
        throw new Error("Content app has not been created yet.");
    }

    return currentContentApp;
}
