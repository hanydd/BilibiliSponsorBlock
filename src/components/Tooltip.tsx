import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { ButtonListener } from "./component-types";
import { isFirefoxOrSafari } from "..";
import { isSafari } from "../config";

export interface TooltipProps {
    text?: string; 
    link?: string;
    linkOnClick?: () => void;
    referenceNode: HTMLElement;
    prependElement?: HTMLElement; // Element to append before
    bottomOffset?: string;
    topOffset?: string;
    leftOffset?: string;
    rightOffset?: string;
    innerBottomMargin?: string;
    timeout?: number;
    opacity?: number;
    displayTriangle?: boolean;
    extraClass?: string;
    showLogo?: boolean;
    showGotIt?: boolean;
    center?: boolean;
    positionRealtive?: boolean;
    containerAbsolute?: boolean;
    buttons?: ButtonListener[];
    elements?: JSX.Element[];
}

export class GenericTooltip {
    text?: string;   
    container: HTMLDivElement;

    timer: NodeJS.Timeout;
    root: Root;
    
    constructor(props: TooltipProps, logoUrl: string) {
        props.bottomOffset ??= "70px";
        props.topOffset ??= "inherit";
        props.leftOffset ??= "inherit";
        props.rightOffset ??= "inherit";
        props.innerBottomMargin ??= "0px";
        props.opacity ??= 0.7;
        props.displayTriangle ??= true;
        props.extraClass ??= "";
        props.showLogo ??= true;
        props.showGotIt ??= true;
        props.positionRealtive ??= true;
        props.containerAbsolute ??= false;
        props.center ??= false;
        props.elements ??= [];
        this.text = props.text;

        this.container = document.createElement('div');
        this.container.id = "sponsorTooltip" + props.text;
        if (props.positionRealtive) this.container.style.position = "relative";
        if (props.containerAbsolute) this.container.style.position = "absolute";
        if (props.center) {
            if (isFirefoxOrSafari() && !isSafari()) {
                this.container.style.width = "-moz-available";
            } else {
                this.container.style.width = "-webkit-fill-available";
            }
        }

        if (props.prependElement) {
            props.referenceNode.insertBefore(this.container, props.prependElement);
        } else {
            props.referenceNode.appendChild(this.container);
        }

        if (props.timeout) {
            this.timer = setTimeout(() => this.close(), props.timeout * 1000);
        }

        const backgroundColor = `rgba(28, 28, 28, ${props.opacity})`;

        this.root = createRoot(this.container);
        this.root.render(
            <div style={{
                    bottom: props.bottomOffset,
                    top: props.topOffset,
                    left: props.leftOffset,
                    right: props.rightOffset,
                    backgroundColor,
                    margin: props.center ? "auto" : undefined
                }}
                className={"sponsorBlockTooltip" +
                    (props.displayTriangle ? " sbTriangle" : "") +
                    (props.opacity === 1 ? " sbSolid" : "") +
                    ` ${props.extraClass}`}>
                <div style={{
                    marginBottom: props.innerBottomMargin
                }}>
                    {props.showLogo ? 
                        <img className="sponsorSkipLogo sponsorSkipObject"
                            src={chrome.runtime.getURL(logoUrl)}> 
                        </img>
                    : null}
                    {this.text ? 
                        <span className={`sponsorSkipObject${!props.showLogo ? ` sponsorSkipObjectFirst` : ``}`}>
                            {this.text + (props.link ? ". " : "")}
                            {props.link ? 
                                <a style={{textDecoration: "underline"}} 
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        href={props.link}>
                                    {chrome.i18n.getMessage("LearnMore")}
                                </a> 
                            : (props.linkOnClick ? 
                                <a style={{textDecoration: "underline", marginLeft: "5px", cursor: "pointer"}} 
                                        onClick={props.linkOnClick}>
                                    {chrome.i18n.getMessage("LearnMore")}
                                </a> 
                            : null)}
                        </span>
                    : null}

                    {props.elements}

                    {this.getButtons(props.buttons)}
                </div>
                {props.showGotIt ?
                    <button className="sponsorSkipObject sponsorSkipNoticeButton"
                        style ={{float: "right" }}
                        onClick={() => this.close()}>

                        {chrome.i18n.getMessage("GotIt")}
                    </button>
                : null}
            </div>
        )
    }

    getButtons(buttons?: ButtonListener[]): JSX.Element[] {
        if (buttons) {
            const result: JSX.Element[] = [];

            for (const button of buttons) {
                result.push(
                    <button className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeRightButton"
                            key={button.name}
                            onClick={(e) => button.listener(e)}>

                            {button.name}
                    </button>
                )
            }

            return result;
        } else {
            return [];
        }
    }

    close(): void {
        this.root.unmount();
        this.container.remove();

        if (this.timer) clearTimeout(this.timer);
    }
}