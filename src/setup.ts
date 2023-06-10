export function generateUserID(length = 36): string {
    const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    const cryptoFuncs = typeof window === "undefined" ? crypto : window.crypto;
    if (cryptoFuncs && cryptoFuncs.getRandomValues) {
            const values = new Uint32Array(length);
            cryptoFuncs.getRandomValues(values);
            for (let i = 0; i < length; i++) {
                    result += charset[values[i] % charset.length];
            }
            return result;
    } else {
            for (let i = 0; i < length; i++) {
                result += charset[Math.floor(Math.random() * charset.length)];
            }
            return result;
    }
}

export function localizeHtmlPage(): void {
    // Localize by replacing __MSG_***__ meta tags
    const localizedTitle = getLocalizedMessage(document.title);
    if (localizedTitle) document.title = localizedTitle;

    const body = document.querySelector(".sponsorBlockPageBody");
    const localizedMessage = getLocalizedMessage(body!.innerHTML.toString());
    if (localizedMessage) body!.innerHTML = localizedMessage;
}

export function getLocalizedMessage(text: string): string | false {
    const valNewH = text.replace(/__MSG_(\w+)__/g, function(match, v1) {
        return v1 ? chrome.i18n.getMessage(v1).replace(/</g, "&#60;")
            .replace(/"/g, "&quot;").replace(/\n/g, "<br/>") : "";
    });

    if (valNewH != text) {
        return valNewH;
    } else {
        return false;
    }
}