/** @jest-environment jsdom */
import CategoryPillComponent from "../src/components/CategoryPillComponent";
import PersistedTooltip from "../src/render/PersistedTooltip";

jest.mock("../src/config", () => ({
    __esModule: true,
    default: { config: { colorPalette: { white: "#fff" } } },
}));
jest.mock("../src/render/MessageNotice", () => ({ showMessage: jest.fn() }));
jest.mock("../src/utils/noticeUtils", () => ({
    downvoteButtonColor: () => "#fff",
    SkipNoticeAction: { Downvote: 0 },
}));
jest.mock("../src/render/PersistedTooltip", () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({ destroy: jest.fn(), open: jest.fn(), close: jest.fn() })),
}));

let component: CategoryPillComponent;
let warn: jest.SpyInstance;
const tooltipConstructor = PersistedTooltip as jest.MockedClass<typeof PersistedTooltip>;

function addMount(): void {
    document.body.innerHTML = '<div id="viewbox_report"><h1>Video</h1><div class="details"></div></div>';
}

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    document.body.innerHTML = "";
    Object.assign(globalThis, { chrome: { i18n: { getMessage: (key: string) => key } } });
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    component = new CategoryPillComponent({ vote: jest.fn(), showTextByDefault: true, showTooltipOnClick: false });
});

afterEach(() => {
    component.componentWillUnmount();
    expect(jest.getTimerCount()).toBe(0);
    warn.mockRestore();
    jest.useRealTimers();
});

test("waits for the container and insertion point without treating missing DOM as an error", () => {
    expect(tooltipConstructor).not.toHaveBeenCalled();
    component.componentDidMount();
    jest.advanceTimersByTime(300);
    document.body.innerHTML = '<div id="viewbox_report"><h1>Video</h1></div>';
    jest.advanceTimersByTime(300);
    expect(tooltipConstructor).not.toHaveBeenCalled();
    addMount();
    jest.advanceTimersByTime(100);
    expect(tooltipConstructor).toHaveBeenCalledTimes(1);
    expect(tooltipConstructor).toHaveBeenCalledWith(expect.objectContaining({
        referenceNode: document.querySelector("#viewbox_report"),
        prependElement: document.querySelector(".details"),
    }));
    expect(warn).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
});

test("stops after ten seconds when the page has no mount point", () => {
    component.componentDidMount();
    jest.advanceTimersByTime(10000);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(tooltipConstructor).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
});

test("unmount cancels waiting and prevents a late tooltip from appearing", () => {
    component.componentDidMount();
    component.componentWillUnmount();
    expect(jest.getTimerCount()).toBe(0);
    addMount();
    jest.advanceTimersByTime(10000);
    expect(tooltipConstructor).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
});

test("mounts immediately when ready and destroys the tooltip on unmount", () => {
    addMount();
    component.componentDidMount();
    const tooltip = component.tooltip;
    expect(tooltip).toBeDefined();
    component.componentWillUnmount();
    expect(tooltip.destroy).toHaveBeenCalledTimes(1);
    expect(component.tooltip).toBeUndefined();
});

test("reports initialization failures with their actual cause", () => {
    addMount();
    const error = new Error("tooltip render failed");
    tooltipConstructor.mockImplementationOnce(() => { throw error; });
    component.componentDidMount();
    expect(warn).toHaveBeenCalledWith("初始化 category tooltip 失败", error);
});
