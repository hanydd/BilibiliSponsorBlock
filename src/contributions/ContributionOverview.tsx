import * as React from "react";
import { ContributionStats, CONTRIBUTION_DISPLAY_DEFAULTS as defaults, duration, number, segmentTime, segmentVideoUrl } from "./model";
import { shortCategoryName } from "../utils/categoryUtils";

export function LifetimeOverview({data}: {data: ContributionStats}) {
    const total=data.lifetime;
    const today=data.impact.find(point=>point.date===data.today);
    return <section className="summary-grid lifetime-summary" aria-label="累计贡献">
        <article className="summary-card"><span>累计被跳过</span><strong>{total ? number(total.skips) : "—"} <small>次</small></strong>
            {today?.skips>=defaults.todaySkips && <small>今日 +{number(today.skips)} 次</small>}</article>
        <article className="summary-card accent"><span>累计为大家节省</span><strong>{total ? duration(total.savedMs) : "—"}</strong>
            {today?.savedMs>=defaults.todaySavedMs && <small>今日 +{duration(today.savedMs)}</small>}</article>
        <article className="summary-card"><span>累计提交</span><strong>{total ? number(total.submissions) : "—"} <small>个片段</small></strong>
            {total && total.skipSegments>0 && <small>{number(total.usedSegments)} / {number(total.skipSegments)} 个跳过片段被使用</small>}
            {data.todaySubmissions>=defaults.todaySubmissions && <small>今日 +{number(data.todaySubmissions)} 个片段</small>}</article>
    </section>;
}
export function RecentFeedback({data}: {data: ContributionStats}) {
    const [expanded,setExpanded]=React.useState(false);
    if (!data.recentSubmissions) return null;
    const all=data.recentSubmissions;
    const rows=expanded?all:all.slice(0,defaults.recentVisible);
    return <section className="panel recent-feedback" aria-label="最近提交">
        <div className="section-head"><h2>最近提交</h2>{data.lifetime?.positiveSegments>0 && <span className="feedback-positive">{number(data.lifetime.positiveSegments)} 个片段获得好评</span>}</div>
        {rows.length===0?<p className="recent-empty">还没有提交片段</p>:<ul className="feedback-list">{rows.map(row=>{
            const url=segmentVideoUrl(row.videoID,row.startTime,row.part);
            const title=row.title||row.videoID;
            return <li key={row.uuid}><div className="feedback-info">
                {url?<a href={url} target="_blank" rel="noopener noreferrer" title={title}>{title} ↗</a>:<span title={title}>{title}</span>}
                <small>{new Date(row.timeSubmitted).toLocaleDateString("zh-CN",{timeZone:"Asia/Shanghai"})} · {shortCategoryName(row.category)||row.category}{row.actionType!=="full"?` · ${segmentTime(row.startTime)}–${segmentTime(row.endTime)}`:""}</small>
            </div><div className="feedback-result"><strong>{row.skips>0?`已被跳过 ${number(row.skips)} 次`:row.actionType==="skip"?(Date.parse(`${data.today}T00:00:00+08:00`)-row.timeSubmitted>=14*86400000?"暂未被跳过":"等待反馈"):"已提交"}</strong>
                {row.status==="hidden"?<small>已隐藏</small>:row.positive?<small className="feedback-positive">获得好评</small>:null}</div></li>;
        })}</ul>}
        {all.length>defaults.recentVisible && <button className="feedback-more" onClick={()=>setExpanded(!expanded)}>{expanded?"收起":"查看更多"}</button>}
    </section>;
}
