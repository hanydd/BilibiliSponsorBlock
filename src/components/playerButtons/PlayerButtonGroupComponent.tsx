import { ConfigProvider, Popconfirm, theme } from "antd";
import * as React from "react";
import Config from "../../config";
import InfoButtonComponent from "./InfoButton";
import PlayerButtonComponent from "./PlayerButton";

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

    function isCreatingSegment(): boolean {
        const segment = sponsorTimesSubmitting.at(-1);
        return !!(segment && segment?.segment?.length != 2);
    }

    function showSubmitButton() {
        return sponsorTimesSubmitting.length > 0 && !Config.config.hideUploadButtonPlayerControls;
    }

    function showdeleteButton() {
        if (Config.config.hideUploadButtonPlayerControls) {
            return false;
        }
        return sponsorTimesSubmitting.length > 1 || (sponsorTimesSubmitting.length > 0 && !isCreatingSegment());
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
                    show={showSubmitButton()}
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
                        show={showdeleteButton()}
                    ></PlayerButtonComponent>
                </Popconfirm>

                <PlayerButtonComponent
                    baseID="cancelSegment"
                    title="sponsorCancel"
                    imageName="PlayerCancelSegmentIconSponsorBlocker.svg"
                    isDraggable={false}
                    show={isCreatingSegment()}
                    onClick={cancelSegmentCallback}
                ></PlayerButtonComponent>

                <PlayerButtonComponent
                    baseID="startSegment"
                    title={isCreatingSegment() ? "sponsorEnd" : "sponsorStart"}
                    imageName={
                        isCreatingSegment() ? "PlayerStopIconSponsorBlocker.svg" : "PlayerStartIconSponsorBlocker.svg"
                    }
                    onClick={startSegmentCallback}
                    isDraggable={false}
                ></PlayerButtonComponent>
            </div>
        </ConfigProvider>
    );
}

export default PlayerButtonGroupComponent;
