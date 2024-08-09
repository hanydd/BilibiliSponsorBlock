import SBObject from "./config";
declare global {
    interface Window {
        SB: typeof SBObject;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        __INITIAL_STATE__?: any;
    }
}
