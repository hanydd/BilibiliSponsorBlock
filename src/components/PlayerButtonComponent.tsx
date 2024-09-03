import * as React from "react";

interface PlayerButtonProps {
    baseID: string;
    title: string;
    imageName: string;
    isDraggable?: boolean;
    onClick: () => void;
}

class PlayerButtonComponent extends React.Component<PlayerButtonProps> {
    constructor(props: PlayerButtonProps) {
        if (props.isDraggable === undefined) {
            props.isDraggable = false;
        }
        super(props);
    }

    render() {
        return (
            <button
                id={this.props.baseID + "Button"}
                className="playerButton bpx-player-ctrl-btn"
                style={{ maxWidth: "40px" }}
                title={chrome.i18n.getMessage(this.props.title)}
                draggable={this.props.isDraggable}
                onClick={this.props.onClick}
            >
                <img
                    id={this.props.baseID + "Image"}
                    className="playerButtonImage bpx-player-ctrl-btn-icon"
                    src={chrome.runtime.getURL("icons/" + this.props.imageName)}
                    draggable={this.props.isDraggable}
                ></img>
            </button>
        );
    }
}

interface PlayerButtonGroupProps {
    startSegmentCallback: () => void;
    cancelSegmentCallback: () => void;
    deleteCallback: () => void;
    submitCallback: () => void;
    infoCallback: () => void;
}

export class PlayerButtonGroupComponent extends React.Component<PlayerButtonGroupProps> {
    constructor(props: PlayerButtonGroupProps) {
        super(props);
    }

    render() {
        return (
            <>
                <PlayerButtonComponent
                    baseID="startSegment"
                    title="sponsorStart"
                    imageName="PlayerStartIconSponsorBlocker.svg"
                    isDraggable={false}
                    onClick={this.props.startSegmentCallback}
                ></PlayerButtonComponent>

                <PlayerButtonComponent
                    baseID="cancelSegment"
                    title="sponsorCancel"
                    imageName="PlayerCancelSegmentIconSponsorBlocker.svg"
                    isDraggable={false}
                    onClick={this.props.cancelSegmentCallback}
                ></PlayerButtonComponent>

                <PlayerButtonComponent
                    baseID="delete"
                    title="clearTimes"
                    imageName="PlayerDeleteIconSponsorBlocker.svg"
                    isDraggable={false}
                    onClick={this.props.deleteCallback}
                ></PlayerButtonComponent>

                <PlayerButtonComponent
                    baseID="submit"
                    title="OpenSubmissionMenu"
                    imageName="PlayerUploadIconSponsorBlocker.svg"
                    isDraggable={false}
                    onClick={this.props.submitCallback}
                ></PlayerButtonComponent>

                <PlayerButtonComponent
                    baseID="info"
                    title="openPopup"
                    imageName="PlayerInfoIconSponsorBlocker.svg"
                    isDraggable={false}
                    onClick={this.props.infoCallback}
                ></PlayerButtonComponent>
            </>
        );
    }
}
