import * as React from "react";
import { forwardRef } from "react";
import PlayerButtonComponent from "./PlayerButton";

interface StartEndSegmentButtonProps {
    isCreatingSegment: boolean;
    onClick: () => void;
}

const StartEndSegmentButton = forwardRef<HTMLButtonElement, StartEndSegmentButtonProps>(function (
    { isCreatingSegment, onClick },
    ref
) {
    return (
        <PlayerButtonComponent
            ref={ref}
            baseID="startSegment"
            title={isCreatingSegment ? "sponsorEnd" : "sponsorStart"}
            imageName={isCreatingSegment ? "PlayerStopIconSponsorBlocker.svg" : "PlayerStartIconSponsorBlocker.svg"}
            isDraggable={false}
            // show={showStartEndButton()}
            onClick={onClick}
        ></PlayerButtonComponent>
    );
});
StartEndSegmentButton.displayName = "StartSegmentButton";

export default StartEndSegmentButton;
