/** @jest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import CommunityPanel from "../src/contributions/CommunityPanel";
import { asyncRequestToServer } from "../src/requests/requests";

jest.mock("../src/requests/requests", () => ({ asyncRequestToServer: jest.fn() }));
jest.mock("../src/utils/categoryUtils", () => ({ shortCategoryName: () => "赞助/恰饭" }));

test("community segment tab displays all ten ranked segments with safe part links and metadata fallbacks", async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const today = new Date(Date.now() + 28800000).toISOString().slice(0,10);
    const topSegments = Array.from({length:10},(_,i) => ({uuid:`segment-${i}`,videoID:"BV1xx411c7mD",cid:String(i),
        part:i===0?3:null,title:i===0?"社区热门片段":null,startTime:i*30,endTime:i*30+20,category:"sponsor",skips:100-i,savedMs:300000}));
    const response = {apiVersion:1,today,timezone:"Asia/Shanghai",generatedAt:new Date().toISOString(),collectionStartedAt:"2026-10-29T13:42:52Z",
        totals:{skips:1000,savedMs:3000000,contributors:1},topSaved:[],topSubmissions:[],topSegments};
    jest.mocked(asyncRequestToServer).mockResolvedValue({ status:200,ok:true,responseText:JSON.stringify(response) });
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root;
    try {
        await act(async () => { root=createRoot(container);root.render(<CommunityPanel refreshToken={0} />); });
        const selector = container.querySelector("select");
        await act(async () => { selector.value="segments";selector.dispatchEvent(new Event("change",{bubbles:true})); });
        const rows = [...container.querySelectorAll(".community-ranking li")];
        expect(rows).toHaveLength(10);
        expect(rows.map(row => row.querySelector(".community-rank").textContent)).toEqual(topSegments.map((_,i) => String(i+1)));
        expect(rows.map(row => row.querySelector(".community-value strong").textContent)).toEqual(topSegments.map(s => `${s.skips} 次跳过`));
        expect(rows[0].querySelector("a").getAttribute("href")).toBe("https://www.bilibili.com/video/BV1xx411c7mD/?p=3&t=0");
        expect(rows[0].querySelector("a").title).toBe("社区热门片段");
        expect(rows[0].querySelector(".community-segment-info small").textContent).toBe("P3 · 0:00–0:20 · 赞助/恰饭");
        expect(rows[1].querySelector("a").getAttribute("href")).toBe("https://www.bilibili.com/video/BV1xx411c7mD/");
        expect(rows[1].querySelector("a").textContent).toContain("BV1xx411c7mD");
        expect(container.querySelector("[role='alert']")).toBeNull();
    } finally {
        await act(async () => root?.unmount());
        container.remove();
        delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    }
});
