import SBObject from "./config";
declare global {
    interface Window {
        SB: typeof SBObject;
        __INITIAL_STATE__?: { bvid: string; aid: number; cid: number; upData: { mid: string }; videoData: { desc: string }};
    }
}
