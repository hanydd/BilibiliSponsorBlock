import { ConfigProvider, Popconfirm, theme } from "antd";
import * as React from "react";
import InfoButtonComponent from "./InfoButton";
import PlayerButtonComponent from "./PlayerButtonComponent";

interface PlayerButtonGroupProps {
    startSegmentCallback: () => void;
    cancelSegmentCallback: () => void;
    deleteCallback: () => void;
    submitCallback: () => void;
    infoCallback: () => void;
}

function PlayerButtonGroupComponent({
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
            <InfoButtonComponent popupOpen={false} infoCallback={infoCallback}></InfoButtonComponent>

            {/* <PlayerButtonComponent
                baseID="info"
                title="openPopup"
                imageName="PlayerInfoIconSponsorBlocker.svg"
                isDraggable={false}
                show={!Config.config.hideInfoButtonPlayerControls && !document.URL.includes("/embed/")}
                onClick={infoCallback}
            ></PlayerButtonComponent> */}

            <PlayerButtonComponent
                baseID="submit"
                title="OpenSubmissionMenu"
                imageName="PlayerUploadIconSponsorBlocker.svg"
                isDraggable={false}
                onClick={submitCallback}
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
                baseID="cancelSegment"
                title="sponsorCancel"
                imageName="PlayerCancelSegmentIconSponsorBlocker.svg"
                isDraggable={false}
                onClick={cancelSegmentCallback}
            ></PlayerButtonComponent>

            <PlayerButtonComponent
                baseID="startSegment"
                title="sponsorStart"
                imageName="PlayerStartIconSponsorBlocker.svg"
                isDraggable={false}
                onClick={startSegmentCallback}
            ></PlayerButtonComponent>
        </ConfigProvider>
    );
}

export default PlayerButtonGroupComponent;
