import { ConfigProvider, Popconfirm, theme } from "antd";
import * as React from "react";
import InfoButtonComponent from "./InfoButton";
import PlayerButtonComponent from "./PlayerButton";
import Config from "../../config";

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
    const [sponsorTimesSubmitting, setSponsorTimesSubmitting] = React.useState([]);

    React.useEffect(() => {
        const handleShowInfoButton = (e: CustomEvent) => setSponsorTimesSubmitting([...e.detail]);
        window.addEventListener("sponsorTimesSubmittingChange", handleShowInfoButton);
        return () => window.removeEventListener("sponsorTimesSubmittingChange", handleShowInfoButton);
    }, []);

    function isSegmentCreationInProgress(): boolean {
        const segment = sponsorTimesSubmitting.at(-1);
        return !!(segment && segment?.segment?.length != 2);
    }

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
            <div style={{ display: Config.config.hideVideoPlayerControls ? "none" : "contents" }}>
                <InfoButtonComponent infoCallback={infoCallback}></InfoButtonComponent>

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
                    show={isSegmentCreationInProgress()}
                    onClick={cancelSegmentCallback}
                ></PlayerButtonComponent>

                <PlayerButtonComponent
                    baseID="startSegment"
                    title="sponsorStart"
                    imageName="PlayerStartIconSponsorBlocker.svg"
                    isDraggable={false}
                    onClick={startSegmentCallback}
                ></PlayerButtonComponent>
            </div>
        </ConfigProvider>
    );
}

export default PlayerButtonGroupComponent;
