import Config from "../config";
import { waitFor, sleep } from "../utils/";
import { DynamicSponsorOption, DynamicSponsorSelection } from "../types";

export { DynamicListener };

async function DynamicListener() {
    const observer = new MutationObserver(async (mutationList) => {
        await sleep(100);

        for (const mutation of mutationList) {
            const element = mutation.addedNodes[0] as HTMLElement;
            const category = isSponsor(element);
            const action = getCategorySelection(category)?.option
            if (category === null || action === DynamicSponsorOption.Disabled) continue;

            const upId = element.querySelector('.bili-dyn-item__avatar').getAttribute('bilisponsor-userid');
            const upIdOrigin = element?.querySelector('.dyn-orig-author__face')?.getAttribute('bilisponsor-userid');
            if ((!(Config.config.whitelistedChannels.includes(upId) ||
                Config.config.whitelistedChannels?.includes(upIdOrigin)) ||
                Config.config.dynamicSponsorWhitelistedChannels) &&
                !(!Config.config.dynamicSpaceSponsorBlocker &&
                window.location.href.includes("space.bilibili.com")) &&
                action === DynamicSponsorOption.Hide
            ) {
                const bodyElement = element.querySelector('.bili-dyn-content') as HTMLElement;
                bodyElement.style.display = 'none';

                const toggleButton = getButton();
                toggleButton.textContent = chrome.i18n.getMessage('dynamicSponsorShow');
                toggleButton.insertBefore(getIcon(), toggleButton.firstChild);
                toggleButton.addEventListener('click', () => {
                    const isHidden = bodyElement.style.display === 'none' || !bodyElement.style.height === null;

                    if (isHidden) {
                        bodyElement.style.display = 'block';
                        bodyElement.style.overflow = 'hidden';
                        bodyElement.style.height = '0px';
                        bodyElement.offsetHeight;

                        const targetHeight = bodyElement.scrollHeight;
                        bodyElement.style.transition = 'height 0.5s ease-in-out';
                        bodyElement.style.height = `${targetHeight}px`;
                    } else {
                        const targetHeight = bodyElement.scrollHeight;
                        bodyElement.style.height = `${targetHeight}px`;
                        bodyElement.offsetHeight;

                        bodyElement.style.transition = 'height 0.5s ease-in-out';
                        bodyElement.style.height = '0px';
                    }
                    bodyElement.addEventListener('transitionend', () => {
                        if (isHidden) {
                            bodyElement.style.height = '';
                        } else {
                            bodyElement.style.display = 'none';
                            bodyElement.style.height = '';
                        }
                    }, { once: true });

                    toggleButton.textContent = chrome.i18n.getMessage(isHidden ? 'dynamicSponsorHide' : 'dynamicSponsorShow');
                    toggleButton.insertBefore(getIcon(), toggleButton.firstChild);
                });
                element.querySelector('.bili-dyn-item__footer').appendChild(toggleButton);
            }
            const dynamicSponsor = document.createElement('div');
            dynamicSponsor.id = 'dynamicSponsorLabel';
            dynamicSponsor.appendChild(getIcon());

            const dynamicSponsorText = document.createElement('span');
            dynamicSponsorText.textContent = chrome.i18n.getMessage(`category_${category}`);
            dynamicSponsor.style.setProperty(
                "--category-color",
                `var(--sb-category-${category})`
            );
            dynamicSponsor.style.setProperty(
                "--category-text-color",
                `var(--sb-category-text-${category})`
            );
            dynamicSponsor.appendChild(dynamicSponsorText);
            dynamicSponsor.addEventListener('mouseenter', () => {
                dynamicSponsorText.style.display = 'block';
                dynamicSponsor.style.borderRadius = '0.5em';
            });
            dynamicSponsor.addEventListener('mouseleave', () => {
                dynamicSponsorText.style.display = 'none';
                dynamicSponsor.style.borderRadius = '2em';
            });

            element.querySelector('.bili-dyn-title').appendChild(dynamicSponsor);

            await sleep(100);
        }
    });

    observer.observe(await getElementWaitFor(".bili-dyn-list__items"), {
        attributeFilter: ['class'],
        childList: true
    });

    (await getElementWaitFor(".bili-dyn-up-list__content, .nav-bar__main-left")).addEventListener("click", async () => {
        observer.disconnect();

        observer.observe(await getElementWaitFor(".bili-dyn-list__items"), {
            attributeFilter: ['class'],
            childList: true,
        });
    });
}

async function getElementWaitFor(element: string) {
    return await waitFor(
        () => document.querySelector(element) as HTMLElement,
        5000,
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

function isSponsor(element: HTMLElement) {
    const pattern = new RegExp(Config.config.dynamicSponsorRegexPattern);
    const goodsElement = element?.querySelector('.bili-dyn-card-goods');
    const goodsElementOrigin = element?.querySelector('.bili-dyn-card-goods.hide-border');
    if (goodsElementOrigin) {
        return "dynamicSponsor_forward_sponsor";
    } else if (goodsElement) {
        return "dynamicSponsor_sponsor";
    }

    let goodsOnText = false
    const contentDiv = element?.querySelectorAll('.bili-rich-text__content span:not(.bili-dyn-item__interaction *)');
    if (!contentDiv) return null;

    let combinedText = '';
    contentDiv.forEach(span => {
        combinedText += span.textContent;
    });
    goodsOnText = pattern.test(combinedText);
    return goodsOnText ? "dynamicSponsor_suspicion_sponsor" : null;
}

function getIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 568 568");
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
