/** Small informational message that follows its player host across documents. */
const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

export function showPlayerMessage(host: HTMLElement, message: string): void {
    if (!host) return;
    let notice = host.querySelector<HTMLElement>(".sbPlayerMessage");
    if (!notice) {
        notice = host.ownerDocument.createElement("div");
        notice.className = "sbPlayerMessage";
        notice.setAttribute("role", "status");
        host.append(notice);
    }
    notice.textContent = message;
    clearTimeout(timers.get(notice));
    timers.set(notice, setTimeout(() => { notice.remove(); timers.delete(notice); }, 4000));
}
