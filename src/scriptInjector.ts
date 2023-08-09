import { versionHigher } from "./versionHigher";
import { version } from "./version.json";

export function injectScript(src: string) {
    const docScript = document.createElement("script");
    docScript.id = "sponsorblock-document-script";
    docScript.setAttribute("version", version)
    docScript.innerHTML = src;

    const head = (document.head || document.documentElement);
    const existingScript = document.getElementById("sponsorblock-document-script");
    const existingScriptVersion = existingScript?.getAttribute("version");
    if (head && (!existingScript || versionHigher(version, existingScriptVersion ?? ""))) {
        if (existingScript) {
            docScript.setAttribute("teardown", "true");
            existingScript.remove();
        }

        head.appendChild(docScript);
    }
}