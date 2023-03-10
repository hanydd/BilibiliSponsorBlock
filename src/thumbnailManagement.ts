export type ThumbnailListener = (newThumbnails: HTMLElement[]) => void;

const handledThumbnails = new Set<HTMLElement>();
let thumbnailListener: ThumbnailListener | null = null;
let selector = "ytd-thumbnail";

export function setThumbnailListener(listener: ThumbnailListener, selector?: string): void {
    thumbnailListener = listener;
    if (selector) this.selector = selector;
}

export function newThumbnails(): HTMLElement[] {
    const thumbnails = document.querySelectorAll(selector) as NodeListOf<HTMLElement>;
    const newThumbnails: HTMLElement[] = [];
    for (const thumbnail of thumbnails) {
        if (!handledThumbnails.has(thumbnail)) {
            handledThumbnails.add(thumbnail);

            newThumbnails.push(thumbnail);

            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === "attributes" && mutation.attributeName === "href") {
                        thumbnailListener?.([thumbnail]);
                        break;
                    }
                }
            });

            const link = thumbnail.querySelector("ytd-thumbnail a");
            if (link) observer.observe(link, { attributes: true });
        }
    }

    thumbnailListener?.(newThumbnails);
    return newThumbnails;
}