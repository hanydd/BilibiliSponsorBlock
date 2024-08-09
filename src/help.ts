import Config from "./config";
import { showDonationLink } from "./config/configUtils";
import { waitFor } from "./utils/";
import { localizeHtmlPage } from "./utils/setup";

if (document.readyState === "complete") {
    init();
} else {
    document.addEventListener("DOMContentLoaded", init);
}

async function init() {
    localizeHtmlPage();

    await waitFor(() => Config.config !== null);

    if (!Config.config.darkMode) {
        document.documentElement.setAttribute("data-theme", "light");
    }

    if (!showDonationLink()) {
        document.getElementById("sbDonate").style.display = "none";
    }
}
