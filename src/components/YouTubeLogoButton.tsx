import * as React from "react";
import { PortVideo } from "../types";

interface YouTubeLogoButtonProps {
    // isBound: boolean;
    onClick: () => void;
    title: string;
}

interface YouTubeLogoButtonState {
    isExpanded: boolean;
    isBound: boolean;
}

class YouTubeLogoButton extends React.Component<YouTubeLogoButtonProps, YouTubeLogoButtonState> {
    constructor(props: YouTubeLogoButtonProps) {
        super(props);
        this.state = {
            isExpanded: false,
            isBound: false,
        };
        this.handleClick = this.handleClick.bind(this);
        this.setPortVideo = this.setPortVideo.bind(this);
        this.fillColor = this.fillColor.bind(this);
    }

    handleClick() {
        this.setState({ isExpanded: !this.state.isExpanded });
        this.props.onClick();
    }

    setPortVideo(portVideo: PortVideo) {
        this.setState({ isBound: !!portVideo?.UUID });
    }

    private fillColor() {
        return this.state.isBound ? "#c76b6b" : "CurrentColor";
    }

    render(): React.ReactNode {
        return (
            <button className="youtube-logo-button" onClick={this.handleClick} title={this.props.title}>
                <svg className="youtube-logo-svg" viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg">
                    <path
                        fill={this.fillColor()}
                        d="M27.9727 3.12324C27.6435 1.89323 26.6768 0.926623 25.4468 0.597366C23.2197 2.24288e-07 14.285 0 14.285 0C14.285 0 5.35042 2.24288e-07 3.12323 0.597366C1.89323 0.926623 0.926623 1.89323 0.597366 3.12324C2.24288e-07 5.35042 0 10 0 10C0 10 2.24288e-07 14.6496 0.597366 16.8768C0.926623 18.1068 1.89323 19.0734 3.12323 19.4026C5.35042 20 14.285 20 14.285 20C14.285 20 23.2197 20 25.4468 19.4026C26.6768 19.0734 27.6435 18.1068 27.9727 16.8768C28.5701 14.6496 28.5701 10 28.5701 10C28.5701 10 28.5677 5.35042 27.9727 3.12324Z"
                    ></path>
                    <path
                        className={`youtube-logo-triangle ${this.state.isExpanded ? "expanded" : ""}`}
                        fill="var(--bg1)"
                        d="M11.4253 14.2854L18.8477 10.0004L11.4253 5.71533V14.2854Z"
                    ></path>
                </svg>
            </button>
        );
    }
}

export default YouTubeLogoButton;
