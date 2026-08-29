import SBObject from "./config";
import {
    BilibiliResponse,
    BiliPlayInfo,
    BiliVideoDetail,
    BiliVideoDetailForEvent,
} from "./requests/type/BilibiliRequestType";
import { AID, BVID, CID } from "./types";
declare global {
    interface SponsorBlockLifecycleLogEntry {
        time: string;
        stage: string;
        hidden?: boolean;
        readyState?: DocumentReadyState;
        details: Record<string, unknown>;
    }

    interface SponsorBlockLifecycleStageSummary {
        count: number;
        firstTime: string;
        lastTime: string;
        hiddenTransitions: number;
        readyStates: DocumentReadyState[];
    }

    interface Window {
        SB: typeof SBObject;
        SBLogs: {
            debug: string[];
            warn: string[];
            lifecycle: SponsorBlockLifecycleLogEntry[];
            lifecycleSummary: Record<string, SponsorBlockLifecycleStageSummary>;
        };
        __INITIAL_STATE__?: {
            bvid: BVID;
            toBvid: BVID;
            aid: AID;
            cid: CID;
            upData: { mid: string };
            videoData: BiliVideoDetail;
            videoInfo: BiliVideoDetailForEvent;
        };
        __playinfo__?: BilibiliResponse<BiliPlayInfo>;
        player?: {
            getManifest?: () => { aid: AID | null; cid: CID | null; bvid: BVID | null; p: number };
            setPlaybackRate?: (rate: number) => void;
            getPlaybackRate?: () => number;
        };
    }
}
