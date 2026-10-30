/** @jest-environment jsdom */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LifetimeOverview, RecentFeedback } from "../src/contributions/ContributionOverview";
import { ContributionStats } from "../src/contributions/model";
jest.mock("../src/utils/categoryUtils",()=>({shortCategoryName:(name:string)=>name}));
const data = (submissions:number,skips:number,savedMs:number) => ({today:"2026-11-08",todaySubmissions:submissions,
    impact:[{date:"2026-11-08",skips,savedMs,status:"partial"}],
    lifetime:{submissions:69,skipSegments:60,usedSegments:55,skips:2580,savedMs:58*3600000,positiveSegments:2}} as ContributionStats);
const render = (element: React.ReactElement) => {const host=document.createElement("div");host.innerHTML=renderToStaticMarkup(element);return host;};
test("quiet days hide daily increments without hiding lifetime impact",()=>{
    const host=render(<LifetimeOverview data={data(0,0,0)}/>);
    expect(host.textContent).not.toContain("今日");
    expect(host.textContent).toContain("2,580");expect(host.textContent).toContain("58 小时");
    expect(host.textContent).toContain("69");expect(host.textContent).toContain("55 / 60 个跳过片段被使用");
});
test.each([1,3])("even %i daily skips and short savings are shown",(skips)=>{
    const host=render(<LifetimeOverview data={data(0,skips,9000)}/>);
    const cards=host.querySelectorAll("article");
    expect(cards[0].textContent).toContain(`今日 +${skips} 次`);
    expect(cards[1].textContent).toContain("今日 +9 秒");
    expect(cards[2].textContent).not.toContain("今日");
});
test("daily increments appear in their respective lifetime cards",()=>{
    const host=render(<LifetimeOverview data={data(1,20,1800000)}/>);
    const cards=host.querySelectorAll("article");
    expect(cards[0].textContent).toContain("今日 +20 次");
    expect(cards[1].textContent).toContain("今日 +30 分钟");
    expect(cards[2].textContent).toContain("今日 +1 个片段");
});
test("old unused submissions do not wait forever and non-skip actions do not show zero skips",()=>{
    const value=data(0,0,0);
    value.recentSubmissions=[
        {uuid:"old",timeSubmitted:Date.parse("2026-05-01"),actionType:"skip"},
        {uuid:"new",timeSubmitted:Date.parse("2026-11-07"),actionType:"skip"},
        {uuid:"tag",timeSubmitted:Date.parse("2026-11-07"),actionType:"full"},
    ].map(row=>({...row,videoID:"demo",title:null,part:null,cid:"1",startTime:0,endTime:10,category:"sponsor",skips:0,status:"visible",positive:false}));
    const host=render(<RecentFeedback data={value}/>);
    expect(host.textContent).toContain("暂未被跳过");expect(host.textContent).toContain("等待反馈");expect(host.textContent).toContain("已提交");
});

test("today's trend point is hollow and its incoming line is dashed",()=>{
    const value=data(0,3,9000);
    value.generatedAt="2026-11-08T04:30:00Z";
    value.collectionStartedAt="2026-11-01T00:00:00+08:00";
    value.impact.unshift({date:"2026-11-07",skips:20,savedMs:60000,status:"complete"});
    const Trend=require("../src/contributions/ContributionTrend").default;
    const host=render(<Trend data={value}/>);
    expect(host.querySelectorAll("circle.partial")).toHaveLength(1);
    expect(host.querySelectorAll('path[stroke-dasharray="4 4"]')).toHaveLength(1);
    expect(host.querySelector('[aria-label^="今日截至 12:30"]')).not.toBeNull();
});
