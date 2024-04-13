import Config from "./config";
import { localizeHtmlPage } from "../maze-utils/src/setup";

// This is needed, if Config is not imported before Utils, things break.
// Probably due to cyclic dependencies
Config.config;

if (document.readyState === "complete") {
    init();
} else {
    document.addEventListener("DOMContentLoaded", init);
}

async function init() {
    localizeHtmlPage();
}