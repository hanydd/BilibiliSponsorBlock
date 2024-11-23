import SBObject from "./config";
declare global {
    interface Window {
        SB: typeof SBObject;
        __INITIAL_STATE__?: {
            aid: number;
            bvid: string;
            p: number;
            upInfo: { mid: number };
            videoData: {
                aid: number;
                bvid: string;
                cid: number;
                desc: string;
            };
        };
        __playinfo__?: { data: { quality: number; dash: { video: { id: number; frameRate: number }[] } } };
    }
}
