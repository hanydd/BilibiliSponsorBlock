import { test, expect } from './fixtures/extension';
import { defaultMockBvid, defaultMockCid, routeMockBilibiliVideoPage } from './support/bilibiliPage';
import { routeMockSponsorSegments } from './support/sponsorBlockApi';
import { readLocalStorage, writeSyncStorage } from './support/extensionStorage';
import { waitForBilibiliContentScript } from './support/submissionNotice';

for (const alreadyOpen of [false, true]) test(`document PiP blocks the submission panel and keeps drafts (already open=${alreadyOpen})`, async ({
    extensionContext: context, extensionPage: page, extensionServiceWorker: worker, sendContentMessage,
}) => {
    const errors: string[] = [];
    const submissions: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    context.on('request', request => {
        if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/skipSegments') submissions.push(request.url());
    });
    await writeSyncStorage(worker, { submitKeybind: { key: 'o' }, actuallySubmitKeybind: { key: 'u' }, showShortcutPopover: false });
    await routeMockBilibiliVideoPage(page);
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    const { videoID } = await waitForBilibiliContentScript(page, sendContentMessage);
    const readDraft = async () => (await readLocalStorage<Record<string, { segment: number[] }[]>>(worker, 'unsubmittedSegments'))?.[videoID]?.map(s => s.segment);
    if (alreadyOpen) {
        await sendContentMessage({ message: 'importSegments', data: '0:10 - 0:20 sponsor' });
        await page.locator('#sponsorTimesContainerSubmissionNotice0').click();
        await page.locator('#submittingTime0SubmissionNotice0').fill('0:12');
        await expect.poll(readDraft).toEqual([[12, 20]]);
    }
    const popup = context.waitForEvent('page');
    await page.evaluate(async () => {
        const pip = await window['documentPictureInPicture'].requestWindow({ width: 480, height: 270 });
        const area = document.querySelector('.bpx-player-video-area');
        const parent = area.parentElement;
        pip.document.body.append(area);
        pip.addEventListener('pagehide', () => parent.prepend(area), { once: true });
    });
    const pip = await popup;
    await pip.setViewportSize({ width: 480, height: 270 });
    pip.on('pageerror', error => errors.push(error.message));
    if (!alreadyOpen) await sendContentMessage({ message: 'importSegments', data: '0:10 - 0:20 sponsor' });
    const hint = await worker.evaluate(() => chrome.i18n.getMessage('submissionUnavailableInPip'));
    await expect(pip.locator('.sbPlayerMessage')).toHaveText(hint);
    await expect(pip.locator('#submissionNoticeContainer')).toHaveCount(0);
    await expect(page.locator('#submissionNoticeContainer')).toHaveCount(0);
    await pip.bringToFront();
    await pip.keyboard.press('o');
    await pip.keyboard.press('u');
    await sendContentMessage({ message: 'submitTimes' });
    await expect(pip.locator('.sbPlayerMessage')).toHaveCount(1);
    await expect(pip.locator('#submissionNoticeContainer')).toHaveCount(0);
    await expect.poll(readDraft).toEqual([[alreadyOpen ? 12 : 10, 20]]);
    expect(submissions).toEqual([]);
    await page.evaluate(() => window['documentPictureInPicture'].window.close());
    await page.bringToFront();
    await sendContentMessage({ message: 'submitTimes' });
    await expect(page.locator('#sponsorTimeEditContainerSubmissionNotice0')).toBeVisible();
    await page.locator('#sponsorTimesContainerSubmissionNotice0').click();
    await expect(page.locator('#submittingTime0SubmissionNotice0')).toHaveValue(alreadyOpen ? '0:12.000' : '0:10.000');
    expect(errors).toEqual([]);
});

test('the in-page mini player still opens the submission editor in the main document', async ({
    extensionPage: page, sendContentMessage,
}) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await routeMockBilibiliVideoPage(page);
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await waitForBilibiliContentScript(page, sendContentMessage);
    await page.locator('.bpx-player-container').evaluate(player => {
        player.setAttribute('data-screen', 'mini');
        (player as HTMLElement).style.width = '320px';
        (player as HTMLElement).style.height = '180px';
    });
    await sendContentMessage({ message: 'importSegments', data: '0:10 - 0:20 sponsor' });
    await expect(page.locator('#sponsorTimeEditContainerSubmissionNotice0')).toBeAttached();
    expect(errors).toEqual([]);
});

for (const engine of ['legacy', 'rules']) test(`${engine}: document PiP still copies a card to drafts and sends its vote`, async ({
    extensionContext: context, extensionPage: page, extensionServiceWorker: worker, sendContentMessage,
}) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const votes: string[] = [];
    await context.route(url => url.pathname === '/api/voteOnSponsorTime', async route => {
        votes.push(route.request().url());
        await route.fulfill({ status: 200, body: '{}' });
    });
    await writeSyncStorage(worker, { skipEngineMode: engine, skipOnSeekToSegment: true,
        advanceSkipNotice: false, skipNoticeDuration: 60, categorySelections: [{ name: 'sponsor', option: 2 }] });
    await routeMockSponsorSegments(context, defaultMockBvid, [{
        segment: [20, 25], UUID: 'pip-copy', category: 'sponsor', actionType: 'skip', cid: defaultMockCid, videoDuration: 120,
    }]);
    await routeMockBilibiliVideoPage(page);
    await page.goto(`https://www.bilibili.com/video/${defaultMockBvid}/`);
    await waitForBilibiliContentScript(page, sendContentMessage);
    await sendContentMessage({ message: 'refreshSegments' });
    await page.addStyleTag({ content: 'video { width: 100%; height: 100%; }' });
    const popup = context.waitForEvent('page');
    await page.evaluate(async () => {
        const pip = await window['documentPictureInPicture'].requestWindow({ width: 480, height: 270 });
        for (const sheet of document.styleSheets) {
            const style = pip.document.createElement('style');
            style.textContent = [...sheet.cssRules].map(rule => rule.cssText).join('\n');
            pip.document.head.append(style);
        }
        const area = document.querySelector('.bpx-player-video-area');
        pip.document.body.append(area);
    });
    const pip = await popup;
    pip.on('pageerror', error => errors.push(error.message));
    await pip.setViewportSize({ width: 480, height: 270 });
    await pip.bringToFront();
    await pip.locator('video').evaluate(async (v: HTMLVideoElement) => { v.currentTime = 21; await v.play(); });
    const card = pip.locator('.sponsorSkipStackCard');
    await expect(card).toBeVisible();
    await pip.locator('video').evaluate((v: HTMLVideoElement) => v.pause());
    await card.locator('.sponsorSkipStackHeader').hover();
    await card.locator('.voteButton').nth(2).click();
    await card.locator('[id^="sponsorSkipNoticeEditSegmentsRow"] button').first().click();
    await expect.poll(async () => {
        const drafts = await readLocalStorage<Record<string, { segment: number[] }[]>>(worker, 'unsubmittedSegments');
        return drafts?.[`${defaultMockBvid}+${defaultMockCid}`]?.map(segment => segment.segment);
    }).toEqual([[20, 25]]);
    await expect.poll(() => votes.length).toBe(1);
    expect(new URL(votes[0]).searchParams.get('type')).toBe('0');
    if (engine === 'rules') await expect(card).toHaveCount(0);
    await expect(pip.locator('#submissionNoticeContainer')).toHaveCount(0);
    expect(errors).toEqual([]);
});
