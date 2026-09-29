/** @jest-environment jsdom */
import { ThumbnailObserver } from "../src/thumbnail-utils/thumbnailObserver";
import { labelThumbnail } from "../src/thumbnail-utils/thumbnails";

jest.mock("../src/thumbnail-utils/thumbnails", () => ({ labelThumbnail: jest.fn(async () => null) }));

let visibilityChanged: IntersectionObserverCallback;
const unobserve = jest.fn();
const disconnect = jest.fn();
let observer: ThumbnailObserver;
let container: HTMLElement;
let card: HTMLElement;

function setVisible(visible: boolean): void {
    visibilityChanged([{
        target: card,
        isIntersecting: visible,
        boundingClientRect: { width: 200, height: 50 },
    } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
}

beforeEach(() => {
    jest.clearAllMocks();
    global.IntersectionObserver = jest.fn((callback: IntersectionObserverCallback) => {
        visibilityChanged = callback;
        return { observe: jest.fn(), unobserve, disconnect };
    }) as unknown as typeof IntersectionObserver;
    document.body.innerHTML = '<div class="video-pod"><div class="pod-item simple" data-key="BV1JfLg6qEtf"><div class="single-p"><div class="stats"></div></div></div></div>';
    container = document.querySelector(".video-pod");
    card = container.querySelector(".pod-item");
    observer = new ThumbnailObserver(container, "playerListPod", jest.fn());
});

afterEach(() => observer.disconnect());

test("retains the label and does no work on repeated visits or ordinary refreshes", async () => {
    expect(labelThumbnail).not.toHaveBeenCalled();
    setVisible(true);
    await Promise.resolve();
    // The extension's own label insertion must not invalidate the card.
    const label = document.createElement("div");
    label.className = "sponsorThumbnailLabel sponsorThumbnailLabelVisible";
    card.querySelector(".stats").after(label);
    await Promise.resolve();
    setVisible(false);
    expect(card.querySelector(".sponsorThumbnailLabelVisible")).toBe(label);
    observer.refresh();
    setVisible(true);
    observer.refresh();
    expect(labelThumbnail).toHaveBeenCalledTimes(1);
    expect(card.querySelector(".sponsorThumbnailLabelVisible")).toBe(label);
});

test("also remembers a no-label result", async () => {
    setVisible(true);
    await Promise.resolve();
    setVisible(false);
    setVisible(true);
    expect(labelThumbnail).toHaveBeenCalledTimes(1);
});

test("defers a changed offscreen card until it returns, then updates it once", async () => {
    setVisible(true);
    await Promise.resolve();
    setVisible(false);
    card.dataset.key = "BV1TiuZ6TEQw";
    await Promise.resolve();
    observer.refresh();
    expect(labelThumbnail).toHaveBeenCalledTimes(1);
    setVisible(true);
    expect(labelThumbnail).toHaveBeenCalledTimes(2);
    setVisible(false);
    setVisible(true);
    expect(labelThumbnail).toHaveBeenCalledTimes(2);
});

test("reprocesses a visible card when its cover is replaced", async () => {
    setVisible(true);
    await Promise.resolve();
    card.querySelector(".single-p").innerHTML = '<div class="stats"></div>';
    await Promise.resolve();
    expect(labelThumbnail).toHaveBeenCalledTimes(2);
});

test("settings invalidation updates visible cards and defers offscreen cards", () => {
    setVisible(true);
    observer.refresh(true);
    expect(labelThumbnail).toHaveBeenCalledTimes(2);
    setVisible(false);
    observer.refresh(true);
    expect(labelThumbnail).toHaveBeenCalledTimes(2);
    setVisible(true);
    expect(labelThumbnail).toHaveBeenCalledTimes(3);
});

test("releases removed cards and ignores stale visibility notifications", async () => {
    setVisible(true);
    card.remove();
    await Promise.resolve();
    expect(unobserve).toHaveBeenCalledWith(card);
    setVisible(true);
    expect(labelThumbnail).toHaveBeenCalledTimes(1);
});
