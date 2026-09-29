import Config from "../config";
import { waitFor } from "../utils/";
import { DynamicSponsorOption, DynamicSponsorSelection } from "../types";
import { addCleanupListener } from "../utils/cleanup";
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
                if (action !== DynamicSponsorOption.Hide) continue;
                if (category === "dynamicSponsor_suspicion_sponsor" ? dynamicSponsorMatch.length < Config.config.dynamicAndCommentSponsorRegexPatternKeywordNumber : false) continue;

                const bodyElement = element.querySelector('.bili-dyn-content') as HTMLElement;
                hideSponsorContent(bodyElement, element.querySelectorAll('.bili-dyn-item__action')[2] as HTMLElement);
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

let scanComments: (() => void) | null = null;
let commentCompensationScheduled = false;

function CommentListener() {
    if (scanComments) {
        scanComments();
        return;
    }

    const observers = new Map<HTMLElement, { shadow: ShadowRoot; observer: MutationObserver }>();
    const scan = () => {
        for (const [root, entry] of observers) {
            if (!root.isConnected) {
                entry.observer.disconnect();
                observers.delete(root);
            }
        }
        if (document.hidden || !Config.config.dynamicAndCommentSponsorBlocker || !Config.config.commentSponsorBlock) return;

        const observeComments = (host: HTMLElement) => {
            const shadow = host.shadowRoot;
            if (!shadow) return;
            if (observers.get(host)?.shadow !== shadow) {
                observers.get(host)?.observer.disconnect();
                const observer = new MutationObserver(scan);
                observer.observe(shadow, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ["data-type", "data-user-profile-id"],
                });
                observers.set(host, { shadow, observer });
            }
            // MutationObserver does not cross into nested shadow roots.
            for (const child of shadow.querySelectorAll<HTMLElement>(
                "bili-comment-thread-renderer, bili-comment-renderer, bili-rich-text, " +
                "bili-comment-user-info, bili-comment-action-buttons-renderer, " +
                "bili-comment-replies-renderer, bili-text-button"
            )) {
                observeComments(child);
            }
        };
        for (const root of document.querySelectorAll<HTMLElement>("bili-comments")) {
            if (!root.shadowRoot) continue;
            observeComments(root);
            SponsorComment(root);
        }
    };

    scanComments = scan;
    // Discover comment sections opened later or replaced along with their container.
    const pageObserver = new MutationObserver((mutations) => {
        const containsComments = (node: Node) => node instanceof Element &&
            (node.matches("bili-comments") || node.querySelector("bili-comments") !== null);
        if (mutations.some(({ addedNodes, removedNodes }) =>
            [...addedNodes, ...removedNodes].some(containsComments))) {
            scan();
        }
    });
    pageObserver.observe(document.documentElement, { childList: true, subtree: true });
    // Schedule at most one delayed scan per page, even if the listener is restarted.
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!commentCompensationScheduled) {
        commentCompensationScheduled = true;
        timer = setTimeout(scan, 5000);
    }
    document.addEventListener("visibilitychange", scan);
    addCleanupListener(() => {
        clearTimeout(timer);
        pageObserver.disconnect();
        document.removeEventListener("visibilitychange", scan);
        for (const { observer } of observers.values()) observer.disconnect();
        observers.clear();
        scanComments = null;
    });
    scan();
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
        if (selection.name === category) return selection;
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
    //文本动态
    const contentDivText = element?.querySelectorAll('.bili-rich-text__content span:not(.bili-dyn-item__interaction *)');
    //专栏/文字动态
    const contentDivOpus = element?.querySelectorAll('.opus-paragraph-children span');
    //专栏/文字动态标题
    const contentOpusTitle = element?.querySelectorAll('.dyn-card-opus__title');
    
    const content = [...contentOpusTitle, ...contentDivText, ...contentDivOpus];
    if (!content) return '';

    let combinedText = '';
    content.forEach(span => {
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

const expandedReplyThreads = new WeakSet<HTMLElement>();
const wiredReplyButtons = new WeakSet<HTMLButtonElement>();

function SponsorComment(root: HTMLElement) {
    const action = getCategorySelection("dynamicSponsor_sponsor")?.option;
    if (action === DynamicSponsorOption.Disabled) return;

    for (const thread of root.shadowRoot.querySelectorAll<HTMLElement>("bili-comment-thread-renderer")) {
        const comment = thread.shadowRoot?.querySelector("bili-comment-renderer");
        const shadow = comment?.shadowRoot;
        const richText = shadow?.querySelector("bili-rich-text")?.shadowRoot;
        if (!richText?.querySelector('a[data-type="goods"]')) continue;

        const avatar = shadow.querySelector("#user-avatar");
        // A delayed avatar must not cause a whitelisted author's comment to be hidden.
        if (Config.config.whitelistedChannels.length && !Config.config.dynamicAndCommentSponsorWhitelistedChannels) {
            const author = avatar?.getAttribute("data-user-profile-id");
            if (!author || Config.config.whitelistedChannels.some(ch => ch.id === author)) continue;
        }

        const userInfo = shadow.querySelector("bili-comment-user-info")?.shadowRoot;
        const labelAnchor = userInfo?.querySelector<HTMLElement>("#user-up, #user-level");
        if (labelAnchor && !userInfo.querySelector("#commentSponsorLabel")) {
            labelSponsorStyle("commentSponsorLabel", labelAnchor, "dynamicSponsor_sponsor", false, null, true);
        }

        if (action !== DynamicSponsorOption.Hide) continue;
        const content = shadow.querySelector<HTMLElement>("#content");
        const actions = shadow.querySelector("bili-comment-action-buttons-renderer")?.shadowRoot;
        const replyButton = actions?.querySelector<HTMLElement>("#reply");
        if (content && replyButton && !actions.querySelector("#showDynamicSponsor")) {
            hideSponsorContent(content, replyButton, true);
        }

        if (Config.config.commentSponsorReplyBlock && !expandedReplyThreads.has(thread)) {
            const repliesRoot = thread.shadowRoot.querySelector("bili-comment-replies-renderer")?.shadowRoot;
            if (!repliesRoot) continue;
            for (const reply of repliesRoot.querySelectorAll<HTMLElement>("bili-comment-reply-renderer")) {
                if (reply.style.display !== "none") reply.style.display = "none";
            }
            const expandButton = repliesRoot.querySelector("bili-text-button")?.shadowRoot?.querySelector("button");
            if (expandButton && !wiredReplyButtons.has(expandButton)) {
                wiredReplyButtons.add(expandButton);
                expandButton.addEventListener("click", () => {
                    expandedReplyThreads.add(thread);
                    for (const reply of repliesRoot.querySelectorAll<HTMLElement>("bili-comment-reply-renderer")) {
                        reply.style.display = "";
                    }
                }, { once: true });
            }
        }
    }
}
