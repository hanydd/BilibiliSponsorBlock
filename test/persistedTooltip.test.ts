/** @jest-environment jsdom */
import PersistedTooltip from "../src/render/PersistedTooltip";

jest.mock("../src/render/Tooltip", () => ({
    Tooltip: jest.fn().mockImplementation(({ referenceNode }: { referenceNode: HTMLElement }) => {
        const container = document.createElement("div");
        referenceNode.appendChild(container);
        return { container, close: jest.fn() };
    }),
}));

test("preserves hover behavior and clears pending hiding when destroyed", () => {
    jest.useFakeTimers();
    const tooltip = new PersistedTooltip({ referenceNode: document.body });
    const container = tooltip.tooltip.container;
    expect(container.style.display).toBe("none");
    tooltip.open();
    expect(container.style.display).toBe("");
    tooltip.close();
    expect(jest.getTimerCount()).toBe(1);
    container.dispatchEvent(new MouseEvent("mouseenter"));
    expect(jest.getTimerCount()).toBe(0);
    expect(container.style.opacity).toBe("1");
    container.dispatchEvent(new MouseEvent("mouseleave"));
    expect(jest.getTimerCount()).toBe(1);
    tooltip.destroy();
    expect(container.isConnected).toBe(false);
    expect(tooltip.persistEndTimer).toBeNull();
    // Unmount the separate React root after its parent finishes unmounting.
    jest.runAllTicks();
    expect(tooltip.tooltip.close).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
});
