import SBObject from "./config";
import { BilibiliResponse, BiliPlayInfo, BiliVideoDetail } from "./requests/type/BilibiliRequestType";
declare global {
    interface Window {
        SB: typeof SBObject;
        __INITIAL_STATE__?: {
            bvid: string;
            aid: number;
            cid: number;
            upData: { mid: string };
            videoData: BiliVideoDetail;
        };
        __playinfo__?: BilibiliResponse<BiliPlayInfo>;
    }
}
