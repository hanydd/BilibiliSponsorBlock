import SBObject from "./config";
declare global {
    interface Window {
        SB: typeof SBObject;
        __INITIAL_STATE__?: any;
    }
}
