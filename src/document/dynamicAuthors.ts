/** MAIN world only; start after the page framework has mounted. */
export function observeDynamicAuthors(): () => void {
    const scan = () => {
        for (const item of document.querySelectorAll(".bili-dyn-list__items .bili-dyn-item")) {
            const author = (item as Element & {
                __vue__?: { author?: { mid: number; type: string } };
            }).__vue__?.author;
            if (!author?.mid || author.type !== "AUTHOR_TYPE_NORMAL") continue;
            const avatar = item.querySelector(".bili-dyn-item__avatar");
            const mid = author.mid.toString();
            if (avatar && avatar.getAttribute("bilisponsor-userid") !== mid) {
                avatar.setAttribute("bilisponsor-userid", mid);
            }
        }
    };
    const containsList = (node: Node) => node instanceof Element &&
        (node.matches(".bili-dyn-list__items") || !!node.querySelector(".bili-dyn-list__items"));
    const observer = new MutationObserver(records => {
        if (records.some(record => {
            const target = record.target instanceof Element ? record.target : record.target.parentElement;
            return !!target?.closest(".bili-dyn-list__items") ||
                [...record.addedNodes, ...record.removedNodes].some(containsList);
        })) scan();
    });
    // No list or navigation is required. Logged-out/space pages can create or
    // replace lists later; text/comment nodes are never treated as elements.
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scan();
    return () => observer.disconnect();
}
