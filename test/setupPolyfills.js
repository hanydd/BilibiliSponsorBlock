// jsdom 环境缺少部分 Node 全局，react-dom/server 需要 TextEncoder/TextDecoder
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TextEncoder, TextDecoder } = require("util");

if (typeof global.TextEncoder === "undefined") {
    global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === "undefined") {
    global.TextDecoder = TextDecoder;
}
