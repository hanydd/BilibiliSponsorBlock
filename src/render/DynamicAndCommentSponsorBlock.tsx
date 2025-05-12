import Config from "../config";
import { waitFor } from "../utils/";
import { DynamicSponsorOption, DynamicSponsorSelection } from "../types";
import { detectPageType } from "../utils/video";
import { PageType } from "../types";

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
            if ((!(Config.config.whitelistedChannels.includes(upId) ||
                Config.config.whitelistedChannels?.includes(upIdOrigin)) ||
                Config.config.dynamicAndCommentSponsorWhitelistedChannels) &&
                !(!Config.config.dynamicSpaceSponsorBlocker &&
                window.location.href.includes("space.bilibili.com")) &&
                action === DynamicSponsorOption.Hide
            ) {
                const bodyElement = element.querySelector('.bili-dyn-content') as HTMLElement;

                hideSponsorContent(bodyElement, element.querySelectorAll('.bili-dyn-item__action')[2] as HTMLElement);
                labelSponsorStyle("dynamicSponsorLabel", element.querySelector('.bili-dyn-title__text'), category, debugMode, dynamicSponsorMatch);
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
    
    const initialization = new MutationObserver(async () => {
        SponsorComment(commentElementsRoot);

        (await getElementWaitFor(() => commentElementsRoot?.shadowRoot.querySelector("bili-comments-header-renderer")?.shadowRoot.querySelector("#sort-actions"))).addEventListener("click", async () => {
            SponsorComment(commentElementsRoot);
        });

        initialization.disconnect();
    });

    let dynListClickHandler: (event: Event) => void;
    if ([PageType.Dynamic,PageType.Channel].includes(detectPageType())) {
        const dynList = await getElementWaitFor(() => document.querySelector(".bili-dyn-list__items"));
    
        dynListClickHandler = async (event) => {
            const target = (event.target as HTMLElement).closest(".bili-dyn-item");
            if (target) {
                commentElementsRoot = await getElementWaitFor(() => target.querySelector('bili-comments'));
                initialization.observe(commentElementsRoot?.shadowRoot, {
                    childList: true
                });
            }
        };
    
        dynList.addEventListener("click", dynListClickHandler, true);
    
        (await getElementWaitFor(() => document.querySelector(".bili-dyn-up-list__content, .nav-bar__main-left"))).addEventListener("click", async () => {
            const newDynList = await getElementWaitFor(() => document.querySelector(".bili-dyn-list__items"));
            
            dynList.removeEventListener("click", dynListClickHandler, true);
            newDynList.addEventListener("click", dynListClickHandler, true);
        });
    } else if ([PageType.Video,PageType.List,PageType.Opus].includes(detectPageType())) {
        initialization.observe(commentElementsRoot.shadowRoot, {
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
    if (inShadeRoot) shadowRootStyle(button)
    
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
    if (inShadeRoot) shadowRootStyle(element)

    const Sponsor = document.createElement('div');
    Sponsor.id = labelName;
    Sponsor.appendChild(getIcon());

    const SponsorText = document.createElement('span');
    SponsorText.textContent = debugMode
        ? chrome.i18n.getMessage(`category_${category}`) + chrome.i18n.getMessage("DynamicSponsorMatch") + SponsorMatch
        : chrome.i18n.getMessage(`category_${category}`);
    Sponsor.style.setProperty(
        "--category-color",
        `var(--sb-category-${category})`
    );
    Sponsor.style.setProperty(
        "--category-text-color",
        `var(--sb-category-text-${category})`
    );
    Sponsor.appendChild(SponsorText);
    Sponsor.addEventListener('mouseenter', () => {
        SponsorText.style.display = 'block';
        Sponsor.style.borderRadius = '0.5em';
    });
    Sponsor.addEventListener('mouseleave', () => {
        SponsorText.style.display = 'none';
        Sponsor.style.borderRadius = '2em';
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
            }

            #dynamicSponsorLabel img {
                width: 1.5em;
                height: 1.5em;
                fill: var(--category-text-color, #fff);
            }

            #dynamicSponsorLabel span {
                display: none;
                padding-left: 0.25em;
                font-size: 1.2em;
                color: var(--category-text-color, #fff);
            }

            #showDynamicSponsor {
                border: none;
                background: transparent;
                cursor: pointer;
                padding: 0;
            }

            #showDynamicSponsor img {
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
            }

            #commentSponsorLabel img {
                width: 1.1em;
                height: 1.1em;
                fill: var(--category-text-color, #fff);
            }

            #commentSponsorLabel span {
                display: none;
                padding-left: 0.25em;
                font-size: 0.8em;
                color: var(--category-text-color, #fff);
            }`;
    element.parentNode!.insertBefore(style, element.nextSibling);
}

function getIcon() {
    const img = document.createElement("img");
    img.src = chrome.runtime.getURL("icons/oldIcon/PlayerStartIconSponsorBlocker.svg");
    return img;
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
        if (comment.shadowRoot.querySelector("bili-comment-user-info").shadowRoot.querySelector("#commentSponsorLabel")) break;

        const isSponsor = Array.from(comment?.shadowRoot.querySelector("bili-rich-text")?.shadowRoot.querySelectorAll("a")).some(link =>
            link.getAttribute("data-type") === "goods"
        );
        const inWhitelist = Config.config.whitelistedChannels.includes(comment?.shadowRoot.querySelector("#user-avatar")?.getAttribute("data-user-profile-id")) && !Config.config.dynamicAndCommentSponsorWhitelistedChannels;

        if (isSponsor && !inWhitelist) {//这里借用动态屏蔽的那套方式
            hideSponsorContent(
                comment.shadowRoot.querySelector("#content")
                , comment.shadowRoot.querySelector('#main').querySelector("bili-comment-action-buttons-renderer").shadowRoot.querySelector("#reply")
                , true
            );
            labelSponsorStyle(
                "commentSponsorLabel"
                , comment.shadowRoot.querySelector("bili-comment-user-info").shadowRoot.querySelector("#user-up")
                || comment.shadowRoot.querySelector("bili-comment-user-info").shadowRoot.querySelector("#user-level")
                , "dynamicSponsor_sponsor"
                , false
                , null
                , true
            );

            //一般来说 评论赞助链接只会有一个而且是置顶的(不排除某些UP主忘置顶了) 所以就处理一次
            break;
        }
    }
}
