import type { Locator } from '@playwright/test';
import { expect } from '../fixtures/extension';

export async function expectNoticeContentColumn(card: Locator): Promise<void> {
    await expect.poll(() => card.evaluate(el => el.getAnimations({ subtree: true })
        .filter(animation => animation.playState === 'running').length)).toBe(0);
    const layout = await card.evaluate(el => {
        const header = el.querySelector('.sponsorSkipStackHeader').getBoundingClientRect();
        const title = el.querySelector('.sponsorSkipMessage').getBoundingClientRect();
        const logo = el.querySelector('.sponsorSkipLogo').getBoundingClientRect();
        const headerControls = [...el.querySelectorAll('.sponsorSkipStackHeader button')]
            .filter(button => getComputedStyle(button).visibility !== 'hidden')
            .map(button => ({ text: button.textContent, rect: button.getBoundingClientRect() }))
            .filter(({ rect }) => rect.width > 0)
            .map(({ text, rect }) => ({ text, left: rect.left, right: rect.right }));
        const body = el.querySelector('.sponsorSkipStackDetailInner');
        const rows = [...body.querySelector('tbody').children]
            .map(row => row.getBoundingClientRect()).filter(rect => rect.height > 0);
        const visibleRects: { text: string; left: number; right: number }[] = [];
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
        let node: Node;
        while ((node = walker.nextNode())) {
            if (!node.textContent.trim() || (node.parentElement as HTMLElement).closest('option')) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of range.getClientRects()) {
                if (rect.width > 0 && rect.height > 0) visibleRects.push({ text: node.textContent, left: rect.left, right: rect.right });
            }
        }
        for (const icon of body.querySelectorAll('svg, select')) {
            const rect = icon.getBoundingClientRect();
            if (rect.width > 0) visibleRects.push({ text: icon.tagName, left: rect.left, right: rect.right });
        }
        return {
            titleLeft: title.left, logoRight: logo.right, right: el.getBoundingClientRect().right,
            visibleRects: [...headerControls, ...visibleRects],
            rowGaps: rows.slice(1).map((row, index) => row.top - rows[index].bottom),
            firstRowCenterGap: rows.length && rows[0].height === 24
                ? rows[0].top + rows[0].height / 2 - (header.top + header.height / 2) : null,
        };
    });
    expect(layout.titleLeft - layout.logoRight).toBeGreaterThanOrEqual(8);
    for (const rect of layout.visibleRects) {
        expect(rect.left, rect.text).toBeGreaterThanOrEqual(layout.titleLeft - 0.5);
        expect(rect.right, rect.text).toBeLessThanOrEqual(layout.right + 0.5);
    }
    for (const gap of layout.rowGaps) expect(gap).toBeCloseTo(8, 1);
    if (layout.firstRowCenterGap !== null) expect(layout.firstRowCenterGap).toBeCloseTo(32, 1);
}
