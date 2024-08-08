export function injectScript(src: string) {
    const docScript = document.createElement("script");
    docScript.id = "sponsorblock-document-script";
    docScript.innerHTML = src;

    const head = document.head || document.documentElement;
    const existingScript = document.getElementById("sponsorblock-document-script");
    if (head && !existingScript) {
        head.appendChild(docScript);
    }
}
