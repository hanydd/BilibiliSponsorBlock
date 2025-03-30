import { TooltipProps } from "../components/Tooltip";
import { Tooltip } from "./Tooltip";


/**
 * `PersistedTooltip` 类的初始化参数，继承自 `TooltipProps`。
 */
interface PersistedTooltipProps extends TooltipProps {
    /**
     * 可选属性，指定用户交互结束后工具提示保持可见的持续时间（以毫秒为单位），默认为500毫秒。
     */
    persistTime?: number;
}

/**
 * `PersistedTooltip` 类用于管理一个持久化的工具提示（Tooltip），
 * 提供了显示和隐藏工具提示的功能，并支持在鼠标悬停时拦截隐藏操作。
 *
 * ### 功能描述
 * - 工具提示可以在延迟指定的持续时间后再隐藏。
 * - 鼠标悬停在工具提示上时，可以阻止其隐藏。
 * - 提供手动打开和关闭工具提示的方法。
 */
class PersistedTooltip {
    /**
     * 管理的 Tooltip 实例
     */
    tooltip: Tooltip;

    /**
     * 延迟时间结束计时器
     */
    persistEndTimer: NodeJS.Timeout;

    /**
     * 延迟时间：由props传入，单位毫秒，默认为500毫秒
     */
    persistTime: number;

    constructor(props: PersistedTooltipProps) {
        this.tooltip = new Tooltip(props);
        this.persistTime = props.persistTime ?? 500;
        this.tooltipHideNow();

        /**
         * 事件监听：
         * 鼠标进入工具提示时，中断隐藏操作。
         * 鼠标离开工具提示时，触发隐藏操作。
         */
        this.tooltip.container.addEventListener("mouseenter", () => {
            this.tooltipInterruptHiding();
        });

        this.tooltip.container.addEventListener("mouseleave", () => {
            this.tooltipToHidden();
        });
    }

    /**
     * 将工具提示设置为可见状态，立即显示。
     */
    private tooltipToVisible() {
        this.tooltip.container.style.transition = "";
        this.tooltip.container.style.display = "";
        this.tooltip.container.style.opacity = "1";
    }

    /**
     * 将工具提示设置为隐藏状态，触发渐隐效果，并在延迟时间后完全隐藏。
     */
    private tooltipToHidden() {
        this.tooltipInterruptHiding();
        this.tooltip.container.style.transition = `opacity ${this.persistTime}ms`;
        this.tooltip.container.style.opacity = "0";
        this.persistEndTimer = setTimeout(() => {
            this.tooltipHideNow();
        }, this.persistTime);
    }

    /**
     * 设置为完全隐藏状态，不触发渐隐效果。
     */
    private tooltipHideNow() {
        this.tooltip.container.style.display = "none";
        this.tooltip.container.style.transition = "";
    }

    /**
     * 中断隐藏操作，取消任何正在进行的隐藏计时器，并将 Tooltip 设置为可见状态。
     */
    private tooltipInterruptHiding() {
        if (this.persistEndTimer) {
            clearTimeout(this.persistEndTimer);
            this.tooltipToVisible();
        }
    }

    /**
     * 手动打开工具提示。如果工具提示正在隐藏的过程中，会取消隐藏操作并立即显示。
     */
    open() {
        if (this.persistEndTimer) {
            clearTimeout(this.persistEndTimer);
        }
        this.tooltipToVisible();
    }

    /**
     * 手动关闭工具提示。工具提示会以指定的持续时间渐隐后隐藏。如果工具提示正在隐藏的过程中，会重新计时。
     */
    close() {
        this.tooltipToHidden();
    }
}

export default PersistedTooltip;
