import { TooltipProps } from "../components/Tooltip";
import { Tooltip } from "./Tooltip";


/**
 * `PersistedTooltip` 类的初始化参数，继承自 `TooltipProps`。
 */
interface PersistedTooltipProps extends TooltipProps {
    /**
     * 可选属性，指定用户交互结束后 Tooltip 保持可见的持续时间（以毫秒为单位），默认为500毫秒。
     */
    persistTime?: number;
}

/**
 * `PersistedTooltip` 类用于管理一个持久化的 Tooltip，
 * 提供了显示和隐藏 Tooltip 的功能，并支持在鼠标悬停时拦截隐藏操作。
 *
 * ### 功能描述
 * - Tooltip 可以在延迟指定的持续时间后再隐藏。
 * - 鼠标悬停在 Tooltip 上时，可以阻止其隐藏。
 * - 提供手动打开和关闭 Tooltip 的方法。
 */
class PersistedTooltip {
    /**
     * 管理的 Tooltip 实例
     */
    tooltip: Tooltip;

    /**
     * 延迟时间结束计时器
     */
    persistEndTimer: NodeJS.Timeout | null = null;

    /**
     * 延迟时间：由props传入，单位毫秒，默认为500毫秒
     */
    persistTime: number;

    constructor(props: PersistedTooltipProps) {
        this.tooltip = new Tooltip(props);
        this.persistEndTimer = null;
        this.persistTime = props.persistTime ?? 500;
        this.tooltipHideNow();

        this.tooltip.container.addEventListener("mouseenter", () => {
            this.tooltipToVisible();
        });

        this.tooltip.container.addEventListener("mouseleave", () => {
            this.tooltipToHidden();
        });
    }

    /**
     * 将 Tooltip 设置为可见状态，立即显示。
     */
    private tooltipToVisible() {
        // 如果正在进行隐藏操作，取消隐藏操作并立即显示
        if (this.persistEndTimer) {
            clearTimeout(this.persistEndTimer);
            this.persistEndTimer = null;
        }
        this.tooltip.container.style.transition = "";
        this.tooltip.container.style.display = "";
        this.tooltip.container.style.opacity = "1";
    }

    /**
     * 将 Tooltip 设置为隐藏状态，触发渐隐效果，并在延迟时间后完全隐藏。
     */
    private tooltipToHidden() {
        if (!this.persistEndTimer) {
            this.tooltip.container.style.transition = `opacity ${this.persistTime}ms`;
            this.tooltip.container.style.opacity = "0";
            this.persistEndTimer = setTimeout(() => {
                this.tooltipHideNow();
            }, this.persistTime);
        }
    }

    /**
     * 设置为完全隐藏状态，不触发渐隐效果。
     */
    private tooltipHideNow() {
        this.tooltip.container.style.display = "none";
        this.tooltip.container.style.transition = "";
    }

    /**
     * 手动打开 Tooltip。如果 Tooltip 正在隐藏的过程中，会取消隐藏操作并立即显示。
     */
    open() {
        this.tooltipToVisible();
    }

    /**
     * 手动关闭 Tooltip。Tooltip 会以指定的持续时间渐隐后隐藏。如果 Tooltip 正在隐藏的过程中，将不会进行任何额外动作。
     */
    close() {
        this.tooltipToHidden();
    }
}

export default PersistedTooltip;
