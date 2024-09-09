import * as React from "react";
import { forwardRef } from "react";

interface PlayerButtonProps {
    baseID: string;
    title: string;
    imageName: string;
    isDraggable?: boolean;
    show?: boolean;
    onClick?: () => void;
}

const PlayerButtonComponent = forwardRef<HTMLButtonElement, PlayerButtonProps>(function (
    { baseID, title, imageName, isDraggable = false, show = true, onClick },
    ref
) {
    return (
        <button
            ref={ref}
            id={baseID + "Button"}
            className="playerButton bpx-player-ctrl-btn"
            style={{ maxWidth: "40px", display: show ? "unset" : "none" }}
            title={chrome.i18n.getMessage(title)}
            draggable={isDraggable}
            onClick={onClick}
        >
            <img
                id={baseID + "Image"}
                className="playerButtonImage bpx-player-ctrl-btn-icon"
                src={chrome.runtime.getURL("icons/" + imageName)}
                draggable={isDraggable}
            ></img>
        </button>
    );
});
PlayerButtonComponent.displayName = "PlayerButtonComponent";

export default PlayerButtonComponent;
