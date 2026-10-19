import { CidReplacementPage, findCidReplacementCandidates } from "../src/utils/cidReplacement";
import { CID, SponsorSourceType, SponsorTime } from "../src/types";

const videoID = "BV1r3426vEN4";
const page: CidReplacementPage = { videoID, pages: [{ page: 1, cid: "200", duration: 120 }] };
const old = { cid: "100", videoDuration: 120.6, source: SponsorSourceType.Server } as SponsorTime;
const find = (snapshot = page, duration = 120.4, segments = [old]) =>
    findCidReplacementCandidates(videoID, "200", duration, snapshot, segments);

test("old-only response discovers one candidate without ever visiting the old CID", () => {
    expect(find()).toEqual([{ videoID, oldCid: "100", newCid: "200" }]);
    expect(find(page, 120.4, [old, old])).toHaveLength(1);
});
test("requires same BV, one P, current CID and valid page metadata", () => {
    expect(find(null)).toEqual([]);
    expect(find({ ...page, videoID: "BV1tHbj6PEMZ" })).toEqual([]);
    expect(find({ ...page, pages: [...page.pages, { page: 2, cid: "100", duration: 120 }] })).toEqual([]);
    expect(find({ ...page, pages: [{ ...page.pages[0], cid: "300" }] })).toEqual([]);
    expect(find({ ...page, pages: [] })).toEqual([]);
    expect(find({ ...page, pages: [{ ...page.pages[0], page: 2 }] })).toEqual([]);
});
test.each([NaN, Infinity, 119, 121, 125])("player duration %s is not same duration", duration => {
    expect(find(page, duration)).toEqual([]);
});
test.each([undefined, NaN, Infinity, 119, 121, 125])("old duration %s is not eligible", videoDuration => {
    expect(find(page, 120, [{ ...old, videoDuration }])).toEqual([]);
});
test("no report for current CID, drafts, invalid CID or inconsistent old durations", () => {
    expect(find(page, 120, [{ ...old, cid: "200" as CID }])).toEqual([]);
    expect(find(page, 120, [{ ...old, source: SponsorSourceType.Local }])).toEqual([]);
    expect(find(page, 120, [{ ...old, cid: "9007199254740992" as CID }])).toEqual([]);
    expect(find(page, 120, [old, { ...old, videoDuration: 130 }])).toEqual([]);
});
