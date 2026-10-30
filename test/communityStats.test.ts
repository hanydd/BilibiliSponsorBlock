import { isCommunityStats } from "../src/contributions/communityModel";
const segment = () => ({uuid:"segment",videoID:"BV1xx411c7mD",cid:"1",part:3,title:"测试片段",startTime:0,endTime:30,category:"sponsor",skips:10,savedMs:300000});
const response = () => ({ apiVersion: 1, today: "2026-11-01", timezone: "Asia/Shanghai", generatedAt: "2026-11-01T03:00:00Z",
    collectionStartedAt: "2026-10-29T13:42:52Z", totals: { skips: 2, savedMs: 30000, contributors: 1 },
    topSegments: [segment()],
    topSaved: [{publicUserID:"a".repeat(64),userName:"用户",skips:2,savedMs:30000}],
    topSubmissions: [{publicUserID:"a".repeat(64),userName:"用户",submissions:1,videos:1}] });
test("accepts community rankings and an empty day", () => {
    expect(isCommunityStats(response())).toBe(true);
    expect(isCommunityStats({...response(),topSaved:[],topSubmissions:[],topSegments:[],totals:{skips:0,savedMs:0,contributors:0}})).toBe(true);
});
test.each([{today:"2026-02-30"},{timezone:"UTC"},{totals:{skips:-1,savedMs:0,contributors:0}},
    {topSaved:[{publicUserID:"private-id",userName:"用户",skips:1,savedMs:1}]},
    {topSubmissions:[{publicUserID:"a".repeat(64),userName:"用户",submissions:1,videos:NaN}]},
    {topSegments:null},{topSegments:Array(11).fill(segment())},
    {topSegments:[segment(),segment()]},{topSegments:[{...segment(),skips:-1}]},
    {topSegments:[{...segment(),endTime:-1}]},{topSegments:[{...segment(),part:0}]},
    {topSaved:Array(6).fill(response().topSaved[0])},{apiVersion:2}])("rejects invalid public community responses: %p",change=>{
    expect(isCommunityStats({...response(),...change})).toBe(false);
});

test("accepts community segment rankings without video metadata", () => {
    expect(isCommunityStats({...response(),topSegments:[{...segment(),part:null,title:null}]})).toBe(true);
});
