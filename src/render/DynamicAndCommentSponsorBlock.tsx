import Config from "../config";
import { waitFor } from "../utils/";
import { DynamicSponsorOption, DynamicSponsorSelection } from "../types";
import { detectPageType } from "../utils/video";
import { PageType } from "../types";
import { insertSBIconDefinition } from "../thumbnail-utils/thumbnails";

export { DynamicListener, CommentListener };

async function DynamicListener() {
    const pattern = regexFromString(Config.config.dynamicAndCommentSponsorRegexPattern);

    const observer = new MutationObserver(async (mutationList) => {
        for (const mutation of mutationList) {
            const element = mutation.addedNodes[0] as HTMLElement;
            if (element.querySelector("#dynamicSponsorLabel")) break;

            let category = isSponsor(element);
            const action = getCategorySelection(category)?.option;
            let dynamicSponsorMatch = [];
            if (category === "dynamicSponsor_suspicion_sponsor") {
                const dynamicSponsorContext = isDynamicSponsorSuspicionSponsor(element);
                //去除一个字的匹配降低误判率
                dynamicSponsorMatch = Array.from(new Set(dynamicSponsorContext.match(pattern) || [])).filter(Boolean).filter((match) => match.length > 1);
                category = dynamicSponsorMatch.length > 0 ? "dynamicSponsor_suspicion_sponsor" : null;
            }
            if (category === null || action === DynamicSponsorOption.Disabled) continue;
            const debugMode = category === "dynamicSponsor_suspicion_sponsor" && Config.config.dynamicSponsorBlockerDebug;

            const upId = element.querySelector('.bili-dyn-item__avatar').getAttribute('bilisponsor-userid');
            const upIdOrigin = element?.querySelector('.dyn-orig-author__face')?.getAttribute('bilisponsor-userid');
            if ((!(Config.config.whitelistedChannels.some(ch => ch.id === upId) ||
                Config.config.whitelistedChannels?.some(ch => ch.id === upIdOrigin)) ||
                Config.config.dynamicAndCommentSponsorWhitelistedChannels) &&
                !(!Config.config.dynamicSpaceSponsorBlocker &&
                window.location.href.includes("space.bilibili.com"))
            ) {
                labelSponsorStyle("dynamicSponsorLabel", element.querySelector('.bili-dyn-title__text'), category, debugMode, dynamicSponsorMatch);
                if (action == DynamicSponsorOption.Hide) {
                    const bodyElement = element.querySelector('.bili-dyn-content') as HTMLElement;
                    hideSponsorContent(bodyElement, element.querySelectorAll('.bili-dyn-item__action')[2] as HTMLElement);
                }
            }
        }
    });

    observer.observe(await getElementWaitFor(() => document.querySelector(".bili-dyn-list__items")), {
        attributeFilter: ['class'],
        childList: true
    });

    (await getElementWaitFor(() => document.querySelector(".bili-dyn-up-list__content, .nav-bar__main-left"))).addEventListener("click", async () => {
        observer.disconnect();

        observer.observe(await getElementWaitFor(() => document.querySelector(".bili-dyn-list__items")), {
            attributeFilter: ['class'],
            childList: true
        });
    });
}

async function CommentListener() {
    let commentElementsRoot: HTMLElement;
    if ([PageType.Dynamic,PageType.Channel].includes(detectPageType())) {
        //可能会有多个评论区 所以没有默认的根节点
    } else if ([PageType.Video,PageType.List,PageType.Opus].includes(detectPageType())) {
        commentElementsRoot = await getElementWaitFor(() => document.querySelector('bili-comments')) as HTMLElement;
    }

    const init = new MutationObserver(async () => {
        SponsorComment(commentElementsRoot);

        (await getElementWaitFor(() => commentElementsRoot?.shadowRoot.querySelector("bili-comments-header-renderer")?.shadowRoot.querySelector("#sort-actions"))).addEventListener("click", async () => {
            init_1.disconnect();
            init_1.observe(commentElementsRoot.shadowRoot.querySelector("#feed"), {
                childList: true
            });
            SponsorComment(commentElementsRoot);
        });

        init.disconnect();
        init_1.observe(commentElementsRoot.shadowRoot.querySelector("#feed"), {
            childList: true
        });
    });
    const init_1 = new MutationObserver(async () => {
       SponsorComment(commentElementsRoot);
    });

    let dynListClickHandler: (event: Event) => void;
    if ([PageType.Dynamic,PageType.Channel].includes(detectPageType())) {
        const dynList = await getElementWaitFor(() => document.querySelector(".bili-dyn-list__items"));

        dynListClickHandler = async (event) => {
            const target = (event.target as HTMLElement).closest(".bili-dyn-item");
            if (target) {
                commentElementsRoot = await getElementWaitFor(() => target.querySelector('bili-comments'));
                init.observe(commentElementsRoot?.shadowRoot, {
                    childList: true
                });
            }
        };

        dynList.addEventListener("click", dynListClickHandler, true);

        (await getElementWaitFor(() => document.querySelector(".bili-dyn-up-list__content, .nav-bar__main-left"))).addEventListener("click", async () => {
            init_1.disconnect();
            const newDynList = await getElementWaitFor(() => document.querySelector(".bili-dyn-list__items"));

            dynList.removeEventListener("click", dynListClickHandler, true);
            newDynList.addEventListener("click", dynListClickHandler, true);
        });
    } else if ([PageType.Video,PageType.List,PageType.Opus].includes(detectPageType())) {
        init.observe(commentElementsRoot.shadowRoot, {
            childList: true
        });
    }
}

async function getElementWaitFor<T>(element: () => T): Promise<T> {
    return await waitFor(
        () => element(),
        10000,
        50
    );
}

function getCategorySelection(category: string): DynamicSponsorSelection {
    for (const selection of Config.config.dynamicSponsorSelections) {
        if (selection.name === category) {
            return selection;
        }
    }
    return { name: category, option: DynamicSponsorOption.Disabled } as DynamicSponsorSelection;
}

function hideSponsorContent(content: HTMLElement, button: HTMLElement, inShadeRoot?: boolean) {
    if (inShadeRoot) {
        shadowRootStyle(button);
        insertSBIconDefinition(button);
    }

    content.style.display = 'none';

    const toggleButton = getButton();
    toggleButton.textContent = chrome.i18n.getMessage('dynamicSponsorShow');
    toggleButton.insertBefore(getIcon(), toggleButton.firstChild);
    toggleButton.addEventListener('click', () => {
        const isHidden = content.style.display === 'none' || !content.style.height === null;

        if (isHidden) {
            content.style.display = 'block';
            content.style.overflow = 'hidden';
            content.style.height = '0px';
            content.offsetHeight;

            const targetHeight = content.scrollHeight;
            content.style.transition = 'height 0.5s ease-in-out';
            content.style.height = `${targetHeight}px`;
        } else {
            const targetHeight = content.scrollHeight;
            content.style.height = `${targetHeight}px`;
            content.offsetHeight;

            content.style.transition = 'height 0.5s ease-in-out';
            content.style.height = '0px';
        }
        content.addEventListener('transitionend', () => {
            if (isHidden) {
                content.style.height = '';
            } else {
                content.style.display = 'none';
                content.style.height = '';
            }
        }, { once: true });

        toggleButton.textContent = chrome.i18n.getMessage(isHidden ? 'dynamicSponsorHide' : 'dynamicSponsorShow');
        toggleButton.insertBefore(getIcon(), toggleButton.firstChild);
    });

    button.parentNode!.insertBefore(toggleButton, button.nextSibling);
}

function labelSponsorStyle(labelName: string, element: HTMLElement, category: string, debugMode: boolean = false, SponsorMatch?:string[], inShadeRoot?: boolean) {
    if (inShadeRoot) {
        shadowRootStyle(element);
        insertSBIconDefinition(element);
    }

    const Sponsor = document.createElement('div');
    Sponsor.id = labelName;
    Sponsor.appendChild(getIcon());
    const Group = document.createElement('div');
    Group.className = 'Text-Group';

    const SponsorText = document.createElement('span');
    SponsorText.className = "Label";
    SponsorText.textContent = chrome.i18n.getMessage(`category_${category}`);
    Group.appendChild(SponsorText);
    if (debugMode) {
        const SponsorTextMatch = document.createElement('span');
        SponsorTextMatch.className = "Match";
        SponsorTextMatch.textContent =  chrome.i18n.getMessage("DynamicSponsorMatch") + SponsorMatch;
        Group.appendChild(SponsorTextMatch);
    }
    Sponsor.style.setProperty(
        "--category-color",
        `var(--sb-category-${category})`
    );
    Sponsor.style.setProperty(
        "--category-text-color",
        `var(--sb-category-text-${category})`
    );
    Sponsor.appendChild(Group);
    Sponsor.addEventListener('mouseenter', () => {
        Group.style.display = 'flex';
        Sponsor.style.borderRadius = '0.5em';
    });
    Sponsor.addEventListener('mouseleave', () => {
        Group.style.display = null;
        Sponsor.style.borderRadius = null;
    });

    element.parentNode!.insertBefore(Sponsor, element.nextSibling);
}

function isSponsor(element: HTMLElement) {
    const goodsElement = element?.querySelector('.bili-dyn-card-goods');
    const goodsElementOrigin = element?.querySelector('.bili-dyn-card-goods.hide-border');
    if (goodsElementOrigin) {
        return "dynamicSponsor_forward_sponsor";
    } else if (goodsElement) {
        return "dynamicSponsor_sponsor";
    } else {
        return "dynamicSponsor_suspicion_sponsor";
    }
}

function isDynamicSponsorSuspicionSponsor(element: HTMLElement) {
    const contentDiv = element?.querySelectorAll('.bili-rich-text__content span:not(.bili-dyn-item__interaction *)');
    if (!contentDiv) return null;

    let combinedText = '';
    contentDiv.forEach(span => {
        combinedText += span.textContent;
    });
    return combinedText;
}

function shadowRootStyle(element: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = `
            /*bilibili Dynamic sponsor label */
            #dynamicSponsorLabel {
                display: flex;
                background-color: var(--category-color, #fff);
                border-radius: 2em;
                padding: 0.4em;
                margin: 0.4em;
                align-items: center;
                transition: border-radius 0.4s 0.05s;
	            z-index: 99;
            }

            #dynamicSponsorLabel svg {
                width: 1.5em;
                height: 1.5em;
                fill: var(--category-text-color, #fff);
            }

            #dynamicSponsorLabel .Text-Group {
                display: none;
                flex-direction: column;
                padding-left: 0.25em;
                font-size: 1.2em;
                color: var(--category-text-color, #fff);
            }

            #dynamicSponsorLabel .Label {
                display: inline-block;
            }

            #dynamicSponsorLabel .Match {
                margin-top: 5px;
            }

            #showDynamicSponsor {
                border: none;
                background: transparent;
                cursor: pointer;
                padding: 0;
            }

            #showDynamicSponsor svg {
                margin-right: 4px;
                height: 1.2em;
                width: 1.2em;
                fill: var(--text2);
            }

            /*bilibili Comment sponsor label */
            #commentSponsorLabel {
                display: flex;
                background-color: var(--category-color, #fff);
                border-radius: 1.5em;
                padding: 0.3em;
                margin: 0.3em;
                align-items: center;
                transition: border-radius 0.4s 0.05s;
	            z-index: 99;
            }

            #commentSponsorLabel svg {
                width: 1.1em;
                height: 1.1em;
                fill: var(--category-text-color, #fff);
            }

            #commentSponsorLabel .Text-Group {
                display: none;
                flex-direction: column;
                padding-left: 0.25em;
                font-size: 0.8em;
                color: var(--category-text-color, #fff);
            }

            #commentSponsorLabel .Label {
                display: inline-block;
            }

            #commentSponsorLabel .Match {
                margin-top: 5px;
            }`;
    element.parentNode!.insertBefore(style, element.nextSibling);
}

function getIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 565.15 568");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#SponsorBlockIcon");
    svg.appendChild(use);
    return svg;
}

function getButton() {
    const toggleButton = document.createElement('button');
    toggleButton.id = 'showDynamicSponsor';
    toggleButton.className = 'bili-dyn-action';
    return toggleButton;
}

function regexFromString(string: string) {
    const match = string.match(/^\/(.*)\/([gimsuy]*)$/);

    if (match) {
        const pattern = match[1];
        const flags = match[2];
        return new RegExp(pattern, flags);
    }

    return new RegExp(string);
}

async function SponsorComment(root: HTMLElement) {
    await getElementWaitFor(() => {
        const comment = root?.shadowRoot?.querySelector("bili-comment-thread-renderer");
        const anchor = comment?.shadowRoot?.querySelector("bili-comment-renderer")?.shadowRoot
            ?.querySelector("bili-rich-text")?.shadowRoot?.querySelectorAll("span");
        return anchor || null;
    });

    const comments = root?.shadowRoot?.querySelectorAll("bili-comment-thread-renderer");
    for (const element of comments) {
        const comment = element?.shadowRoot?.querySelector("bili-comment-renderer");
        const reply = element;
        if (comment.className === "BSB-Processed") continue;
        comment.className = "BSB-Processed";

        const isSponsor = Array.from(comment?.shadowRoot.querySelector("bili-rich-text")?.shadowRoot.querySelectorAll("a")).some(link =>
            link.getAttribute("data-type") === "goods"
        );
        const action = getCategorySelection("dynamicSponsor_sponsor")?.option;
        const inWhitelist = Config.config.whitelistedChannels.some(ch => ch.id === comment?.shadowRoot.querySelector("#user-avatar")?.getAttribute("data-user-profile-id")) && !Config.config.dynamicAndCommentSponsorWhitelistedChannels;

        if (isSponsor && !inWhitelist && action !== DynamicSponsorOption.Disabled) {//这里借用动态屏蔽的那套方式
            labelSponsorStyle(
                "commentSponsorLabel"
                , comment.shadowRoot.querySelector("bili-comment-user-info").shadowRoot.querySelector("#user-up")
                || comment.shadowRoot.querySelector("bili-comment-user-info").shadowRoot.querySelector("#user-level")
                , "dynamicSponsor_sponsor"
                , false
                , null
                , true
            );
            if (action === DynamicSponsorOption.Hide) {
                hideSponsorContent(
                    comment.shadowRoot.querySelector("#content")
                    , comment.shadowRoot.querySelector('#main').querySelector("bili-comment-action-buttons-renderer").shadowRoot.querySelector("#reply")
                    , true
                );

                if (Config.config.dynamicAndCommentSponsorBlocker === true && Config.config.commentSponsorBlock === true && Config.config.commentSponsorReplyBlock === true) {
                    const replys = reply.shadowRoot.querySelector("bili-comment-replies-renderer").shadowRoot.querySelectorAll("bili-comment-reply-renderer");
                    replys.forEach((e) => { (e as HTMLElement).style.display = "none" });

                    reply.shadowRoot.querySelector("bili-comment-replies-renderer").shadowRoot.querySelector("bili-text-button").shadowRoot.querySelector("button").addEventListener("click", () => {
                        replys.forEach((e) => { (e as HTMLElement).style.display = null });
                    }, { once: true });
                }
            }
        }
    }
}
