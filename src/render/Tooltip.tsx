import { GenericTooltip, TooltipProps } from "../components/Tooltip";

export class Tooltip extends GenericTooltip {
    constructor(props: TooltipProps) {
        super(props, "icons/IconSponsorBlocker256px.png");
    }
}
