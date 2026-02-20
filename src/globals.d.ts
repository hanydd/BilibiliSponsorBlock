import SBObject from "./config";
import {
    BilibiliResponse,
    BiliPlayInfo,
    BiliVideoDetail,
    BiliVideoDetailForEvent,
} from "./requests/type/BilibiliRequestType";
import { AID, BVID, CID } from "./types";
declare global {
    interface Window {
        SB: typeof SBObject;
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
    }
}
