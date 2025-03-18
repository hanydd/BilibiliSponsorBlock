import SBObject from "./config";
import { BilibiliResponse, BiliPlayInfo, BiliVideoDetail } from "./requests/type/BilibiliRequestType";
import { AID, BVID, CID } from "./types";
declare global {
    interface Window {
        SB: typeof SBObject;
        __INITIAL_STATE__?: {
            bvid: BVID;
            aid: AID;
            cid: CID;
            upData: { mid: string };
            videoData: BiliVideoDetail;
        };
        __playinfo__?: BilibiliResponse<BiliPlayInfo>;
    }
}
