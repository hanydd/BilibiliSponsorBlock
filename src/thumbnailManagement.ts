export type ThumbnailListener = (newThumbnails: HTMLElement[]) => void;

const handledThumbnails = new Set<HTMLElement>();
let thumbnailListener: ThumbnailListener | null = null;

export function setThumbnailListener(listener: ThumbnailListener): void {
    thumbnailListener = listener;
}

export function newThumbnails(selector: string): HTMLElement[] {
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

    return newThumbnails;
}