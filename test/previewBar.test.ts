/** @jest-environment jsdom */
import PreviewBar, { PreviewBarSegment } from "../src/js-components/previewBar";

jest.mock("../src/config", () => ({ __esModule: true, default: { config: { barTypes: { sponsor: { opacity: 0.7 } } } } }));
jest.mock("../src/utils/categoryUtils", () => ({ shortCategoryName: () => "Sponsor" }));

describe("preview bar in small players", () => {
    afterEach(() => {
        document.body.replaceChildren();
        jest.restoreAllMocks();
    });

    test("allows players without a hover preview popup", () => {
        const preview = new PreviewBar(null, null, null, true);
        expect(() => preview.setupHoverText()).not.toThrow();
    });

    test("maps hover positions using the displayed width of a scaled progress bar", () => {
        document.body.innerHTML = `<div class="bpx-player-progress-area">
            <div class="bpx-player-progress-wrap"><div class="bpx-player-progress-popup">
                <div class="bpx-player-progress-preview"></div>
            </div></div></div>`;
        Object.defineProperty(globalThis, "chrome", { configurable: true, value: { runtime: { id: "test" } } });
        const seekBar = document.querySelector(".bpx-player-progress-wrap") as HTMLElement;
        Object.defineProperty(seekBar, "clientWidth", { value: 800 });
        jest.spyOn(seekBar, "getBoundingClientRect").mockReturnValue({ x: 100, width: 320 } as DOMRect);
        const preview = new PreviewBar(null, null, null, true);
        preview.videoDuration = 120;
        preview.segments = [{ segment: [55, 65], category: "sponsor" } as PreviewBarSegment];
        preview.setupHoverText();
        seekBar.dispatchEvent(new MouseEvent("mouseenter"));
        seekBar.dispatchEvent(new MouseEvent("mousemove", { clientX: 260 }));
        expect(preview.categoryTooltip.textContent).toBe("Sponsor");
        expect(preview.categoryTooltip.style.display).not.toBe("none");
    });
});


test("keeps mini-player colors synchronized and disconnects on removal", async () => {
    document.body.innerHTML = `<div class="bpx-player-container">
        <div class="bpx-player-progress"></div><div class="bpx-player-shadow-progress-area"></div>
        <div class="bpx-player-mini-progress"></div>
    </div>`;
    const preview = new PreviewBar(
        document.querySelector(".bpx-player-progress"),
        document.querySelector(".bpx-player-shadow-progress-area"), null
    );
    const segment = { segment: [10, 30], category: "sponsor" } as PreviewBarSegment;
    preview.set([segment], 100);
    const mini = document.querySelector("#miniPreviewbar");
    expect(mini.children).toHaveLength(1);
    expect((mini.firstElementChild as HTMLElement).style.left).toBe("10%");
    preview.set([{ ...segment, segment: [40, 60], selectedSegment: true }], 100);
    expect(mini.children).toHaveLength(1);
    expect((mini.firstElementChild as HTMLElement).style.left).toBe("40%");
    expect(mini.firstElementChild.classList.contains("selectedSegment")).toBe(true);
    preview.clear();
    expect(mini.children).toHaveLength(0);
    preview.remove();
    const replacement = document.createElement("div");
    replacement.className = "bpx-player-mini-progress";
    document.querySelector(".bpx-player-mini-progress").replaceWith(replacement);
    await Promise.resolve();
    expect(document.querySelector("#miniPreviewbar")).toBeNull();
    document.body.replaceChildren();
});

test("clips truncated tails and excludes out-of-axis intervals and points across all player bars", () => {
    document.body.innerHTML = `<div class="bpx-player-container">
        <div class="bpx-player-progress"></div><div class="bpx-player-shadow-progress-area"></div>
        <div class="bpx-player-mini-progress"></div></div>`;
    const preview = new PreviewBar(document.querySelector(".bpx-player-progress"),
        document.querySelector(".bpx-player-shadow-progress-area"), null);
    const make = (segment: [number, number]) => ({ segment, category: "sponsor" } as PreviewBarSegment);
    const original = [make([730, 754]), make([745, 754]), make([750, 750]), make([30, 30])];
    preview.set(original, 742.8973333333333);
    for (const id of ["previewbar", "shadowPreviewbar", "miniPreviewbar"]) {
        const bars = document.querySelectorAll<HTMLElement>(`#${id} > li`);
        expect(bars).toHaveLength(2);
        expect(bars[0].style.right).toBe("0%");
        expect(parseFloat(bars[0].style.left)).toBeCloseTo(730 / 742.8973333333333 * 100, 3);
        expect(parseFloat(bars[1].style.left)).toBeCloseTo(30 / 742.8973333333333 * 100, 3);
    }
    expect(original[0].segment).toEqual([730, 754]);
    // An axis correction back to the full length restores the omitted marks.
    preview.set(original, 754);
    expect(document.querySelectorAll("#previewbar > li")).toHaveLength(4);
    preview.set(original, NaN);
    expect(document.querySelectorAll("#previewbar > li")).toHaveLength(0);
    preview.remove(); document.body.replaceChildren();
});

test("retains the start mark of an unfinished submission on a finite native axis", () => {
    document.body.innerHTML = '<div class="bpx-player-progress"></div>';
    const preview = new PreviewBar(document.querySelector(".bpx-player-progress"), null, null);
    preview.set([{ segment: [40], category: "sponsor", unsubmitted: true } as unknown as PreviewBarSegment], 100);
    expect(document.querySelectorAll("#previewbar > li")).toHaveLength(1);
    expect((document.querySelector("#previewbar > li") as HTMLElement).style.left).toBe("40%");
    preview.remove(); document.body.replaceChildren();
});
