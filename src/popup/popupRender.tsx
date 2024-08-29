import * as React from "react";
import { createRoot } from "react-dom/client";
import Config from "../config";
import { waitFor } from "../utils/index";
import App from "./app";

document.body.innerHTML = '<div id="app"></div>';

// To prevent clickjacking
let allowPopup = window === window.top;
window.addEventListener("message", async (e): Promise<void> => {
    if (e.source !== window.parent) return;
    if (e.origin.endsWith(".bilibili.com")) {
        allowPopup = true;

        if (e.data && e.data?.type === "style") {
            const style = document.createElement("style");
            style.textContent = e.data.css;
            document.head.appendChild(style);
        }
    }
});

const root = createRoot(document.getElementById("app"));
root.render(<App />);

waitFor(() => Config.config !== null && allowPopup, 5000, 5).then(() => {
    setTimeout(() => {
        document.getElementById("sponsorblockPopup")?.classList.remove("sb-preload");
    }, 10);
});
