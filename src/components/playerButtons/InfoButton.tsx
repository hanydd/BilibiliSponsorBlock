import * as React from "react";
import { forwardRef } from "react";
import Config from "../../config";
import PlayerButtonComponent from "./PlayerButtonComponent";

interface InfoButtonProps {
    popupOpen: boolean;
    infoCallback: () => void;
}

const InfoButtonComponent = forwardRef<HTMLButtonElement, InfoButtonProps>(function (
    { popupOpen = false, infoCallback },
    ref
) {
    function initialShowInfoButton() {
        return !Config.config.hideInfoButtonPlayerControls && !document.URL.includes("/embed/");
    }

    function showInfoButton() {
        return initialShowInfoButton();
    }

    return (
        <PlayerButtonComponent
            ref={ref}
            baseID="info"
            title="openPopup"
            imageName="PlayerInfoIconSponsorBlocker.svg"
            isDraggable={false}
            show={showInfoButton()}
            onClick={infoCallback}
        ></PlayerButtonComponent>
    );
});
InfoButtonComponent.displayName = "InfoButtonComponent";

export default InfoButtonComponent;
