import * as React from "react";
import { forwardRef } from "react";
import Config from "../../config";
import PlayerButtonComponent from "./PlayerButtonComponent";

interface InfoButtonProps {
    infoCallback: () => void;
}

const InfoButtonComponent = forwardRef<HTMLButtonElement, InfoButtonProps>(function ({ infoCallback }, ref) {
    const [popupOpen, setPopupOpen] = React.useState(false);

    React.useEffect(() => {
        const handleShowInfoButton = () => setPopupOpen(false);
        window.addEventListener("closePopupMenu", handleShowInfoButton);
        return () => window.removeEventListener("closePopupMenu", handleShowInfoButton);
    }, []);

    function initialShowInfoButton() {
        return !Config.config.hideInfoButtonPlayerControls && !document.URL.includes("/embed/");
    }

    function showInfoButton() {
        return !popupOpen && initialShowInfoButton();
    }

    function handleInfoBUttonClick() {
        setPopupOpen(true);
        infoCallback();
    }

    return (
        <PlayerButtonComponent
            ref={ref}
            baseID="info"
            title="openPopup"
            imageName="PlayerInfoIconSponsorBlocker.svg"
            isDraggable={false}
            show={showInfoButton()}
            onClick={handleInfoBUttonClick}
        ></PlayerButtonComponent>
    );
});
InfoButtonComponent.displayName = "InfoButtonComponent";

export default InfoButtonComponent;
