import { ConfigProvider, Popconfirm, theme } from "antd";
import * as React from "react";
import { forwardRef } from "react";

interface PlayerButtonProps {
    baseID: string;
    title: string;
    imageName: string;
    isDraggable?: boolean;
    onClick?: () => void;
}

const PlayerButtonComponent = forwardRef<HTMLButtonElement, PlayerButtonProps>(function (
    { baseID, title, imageName, isDraggable = false, onClick },
    ref
) {
    return (
        <button
            ref={ref}
            id={baseID + "Button"}
            className="playerButton bpx-player-ctrl-btn"
            style={{ maxWidth: "40px" }}
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

interface PlayerButtonGroupProps {
    startSegmentCallback: () => void;
    cancelSegmentCallback: () => void;
    deleteCallback: () => void;
    submitCallback: () => void;
    infoCallback: () => void;
}

export function PlayerButtonGroupComponent({
    startSegmentCallback,
    cancelSegmentCallback,
    deleteCallback,
    submitCallback,
    infoCallback,
}: PlayerButtonGroupProps) {
    function getPopconfirmDescription() {
        const message = chrome.i18n.getMessage("confirmMSG").split("\n");
        return (
            <>
                <span>{message[0]}</span>
                <br />
                <span>{message[1]}</span>
            </>
        );
    }

    return (
        <ConfigProvider theme={{ token: { colorPrimary: "#00aeec" }, algorithm: theme.darkAlgorithm }}>
            <PlayerButtonComponent
                baseID="info"
                title="openPopup"
                imageName="PlayerInfoIconSponsorBlocker.svg"
                isDraggable={false}
                onClick={infoCallback}
            ></PlayerButtonComponent>

            <PlayerButtonComponent
                baseID="startSegment"
                title="sponsorStart"
                imageName="PlayerStartIconSponsorBlocker.svg"
                isDraggable={false}
                onClick={startSegmentCallback}
            ></PlayerButtonComponent>

            <PlayerButtonComponent
                baseID="cancelSegment"
                title="sponsorCancel"
                imageName="PlayerCancelSegmentIconSponsorBlocker.svg"
                isDraggable={false}
                onClick={cancelSegmentCallback}
            ></PlayerButtonComponent>

            <Popconfirm
                title={chrome.i18n.getMessage("clearThis")}
                description={getPopconfirmDescription()}
                onConfirm={deleteCallback}
                okText={chrome.i18n.getMessage("confirm")}
                cancelText={chrome.i18n.getMessage("cancel")}
            >
                <PlayerButtonComponent
                    baseID="delete"
                    title="clearTimes"
                    imageName="PlayerDeleteIconSponsorBlocker.svg"
                    isDraggable={false}
                ></PlayerButtonComponent>
            </Popconfirm>
            <PlayerButtonComponent
                baseID="submit"
                title="OpenSubmissionMenu"
                imageName="PlayerUploadIconSponsorBlocker.svg"
                isDraggable={false}
                onClick={submitCallback}
            ></PlayerButtonComponent>
        </ConfigProvider>
    );
}
