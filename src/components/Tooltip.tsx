import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { isFirefox } from "../utils/";
import { ButtonListener } from "./component-types";

export interface TooltipProps {
    text?: string;
    textBoxes?: string[];
    link?: string;
    linkOnClick?: () => void;
    secondButtonOnClick?: () => void;
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
    topTriangle?: boolean;
    extraClass?: string;
    showLogo?: boolean;
    showGotIt?: boolean;
    secondButtonText?: string;
    center?: boolean;
    positionRealtive?: boolean;
    containerAbsolute?: boolean;
    buttons?: ButtonListener[];
    elements?: JSX.Element[];
    buttonsAtBottom?: boolean;
    textBoxMaxHeight?: string;
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
        props.displayTriangle ??= !props.topTriangle;
        props.topTriangle ??= false;
        props.extraClass ??= "";
        props.showLogo ??= true;
        props.showGotIt ??= true;
        props.positionRealtive ??= true;
        props.containerAbsolute ??= false;
        props.center ??= false;
        props.elements ??= [];
        props.buttonsAtBottom ??= false;
        props.textBoxes ??= [];
        props.textBoxMaxHeight ??= "inherit";
        this.text = props.text;

        this.container = document.createElement("div");
        this.container.id = "sponsorTooltip" + props.text;
        if (props.positionRealtive) this.container.style.position = "relative";
        if (props.containerAbsolute) this.container.style.position = "absolute";
        if (props.center) {
            if (isFirefox()) {
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
            <div
                style={{
                    bottom: props.bottomOffset,
                    top: props.topOffset,
                    left: props.leftOffset,
                    right: props.rightOffset,
                    backgroundColor,
                    margin: props.center ? "auto" : undefined,
                }}
                className={
                    "sponsorBlockTooltip" +
                    (props.displayTriangle || props.topTriangle ? " sbTriangle" : "") +
                    (props.topTriangle ? " sbTopTriangle" : "") +
                    (props.opacity === 1 ? " sbSolid" : "") +
                    ` ${props.extraClass}`
                }
            >
                <div
                    style={{
                        marginBottom: props.innerBottomMargin,
                        maxHeight: props.textBoxMaxHeight,
                        overflowY: "auto",
                    }}
                >
                    {props.showLogo ? (
                        <img className="sponsorSkipLogo sponsorSkipObject" src={chrome.runtime.getURL(logoUrl)}></img>
                    ) : null}
                    {this.text ? (
                        <span className={`sponsorSkipObject${!props.showLogo ? ` sponsorSkipObjectFirst` : ``}`}>
                            {this.getTextElements(this.text + (props.link ? ". " : ""))}
                            {props.link ? (
                                <a
                                    style={{ textDecoration: "underline" }}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    href={props.link}
                                >
                                    {chrome.i18n.getMessage("LearnMore")}
                                </a>
                            ) : props.linkOnClick ? (
                                <a
                                    style={{ textDecoration: "underline", marginLeft: "5px", cursor: "pointer" }}
                                    onClick={props.linkOnClick}
                                    onAuxClick={props.linkOnClick}
                                >
                                    {chrome.i18n.getMessage("LearnMore")}
                                </a>
                            ) : null}
                        </span>
                    ) : null}

                    {props.textBoxes
                        ? props.textBoxes.map((text, index) => (
                              <div
                                  key={index}
                                  className={`sponsorSkipObject${!props.showLogo ? ` sponsorSkipObjectFirst` : ``}`}
                              >
                                  {text || String.fromCharCode(8203)} {/* Zero width space */}
                              </div>
                          ))
                        : null}

                    {props.elements}

                    {!props.buttonsAtBottom && this.getButtons(props.buttons, props.buttonsAtBottom)}
                </div>

                {props.buttonsAtBottom && this.getButtons(props.buttons, props.buttonsAtBottom)}

                {props.showGotIt ? (
                    <button
                        className="sponsorSkipObject sponsorSkipNoticeButton"
                        style={{ float: "right" }}
                        onClick={() => this.close()}
                    >
                        {chrome.i18n.getMessage("GotIt")}
                    </button>
                ) : null}

                {props.secondButtonText ? (
                    <button
                        className="sponsorSkipObject sponsorSkipNoticeButton"
                        style={{ float: "right" }}
                        onClick={() => props.secondButtonOnClick?.()}
                    >
                        {props.secondButtonText}
                    </button>
                ) : null}
            </div>
        );
    }

    private getTextElements(text: string): JSX.Element[] {
        if (!text.includes("\n")) return [<>{text}</>];

        const result: JSX.Element[] = [];

        for (const line of text.split("\n")) {
            result.push(
                <div
                    style={{
                        padding: "5px",
                    }}
                    key={line}
                >
                    {line}
                </div>
            );
        }

        return result;
    }

    getButtons(buttons: ButtonListener[] | undefined, buttonsAtBottom: boolean): JSX.Element[] {
        if (buttons) {
            const result: JSX.Element[] = [];

            const style: React.CSSProperties = {};
            if (buttonsAtBottom) {
                style.float = "right";
            }

            for (const button of buttons) {
                result.push(
                    <button
                        className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeRightButton"
                        style={style}
                        key={button.name}
                        onClick={(e) => button.listener(e)}
                    >
                        {button.name}
                    </button>
                );
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
