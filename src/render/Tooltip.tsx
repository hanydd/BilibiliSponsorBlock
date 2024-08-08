import { GenericTooltip, TooltipProps } from "../maze-utils/components/Tooltip";

export class Tooltip extends GenericTooltip {
    constructor(props: TooltipProps) {
        super(props, "icons/IconSponsorBlocker256px.png");
    }
}
