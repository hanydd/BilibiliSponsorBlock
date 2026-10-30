import * as React from "react";
import { asyncRequestToServer } from "../requests/requests";
import { duration, number, segmentTime, segmentVideoUrl } from "./model";
import { shortCategoryName } from "../utils/categoryUtils";
import { CommunityStats, isCommunityStats } from "./communityModel";

const today = () => new Date(Date.now() + 28800000).toISOString().slice(0,10);
export default function CommunityPanel({ refreshToken }: { refreshToken: number }) {
    const [data, setData] = React.useState<CommunityStats | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(false);
    const [retry, setRetry] = React.useState(0);
    const [ranking, setRanking] = React.useState("saved");
    React.useEffect(() => {
        let active = true;
        setLoading(true);
        setError(false);
        void asyncRequestToServer("GET", "/api/communityStats")
            .then((response) => {
                if (response.status !== 200) throw new Error("community unavailable");
                const result: unknown = JSON.parse(response.responseText);
                if (!isCommunityStats(result)) throw new Error("invalid community data");
                if (active) setData(result);
            })
            .catch(() => { if (active) setError(true); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [refreshToken, retry]);
    React.useEffect(() => {
        if (!data) return undefined;
        const refresh = () => {
            if (document.visibilityState === "visible" && (today() !== data.today || Date.now()-Date.parse(data.generatedAt) >= 300000))
                setRetry((value) => value + 1);
        };
        const midnight = Date.parse(`${today()}T00:00:00+08:00`) + 86400000;
        const timer = window.setTimeout(refresh, Math.max(50, midnight-Date.now()+50));
        document.addEventListener("visibilitychange", refresh);
        return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", refresh); };
    }, [data]);
    return (
        <section className="panel community-panel" aria-busy={loading} aria-label="社区今日贡献">
            <div className="section-head">
                <h2>{data && data.today !== today() ? `${data.today.slice(5)} 社区` : "社区今日"}</h2>
                <select aria-label="社区榜单" value={ranking} onChange={(event) => setRanking(event.target.value)}>
                    <option value="saved">节省时间榜</option>
                    <option value="submissions">贡献榜</option>
                    <option value="segments">片段跳过榜</option>
                </select>
            </div>
            {error && <div className="community-error" role="alert">{data ? "更新失败" : "暂时无法加载"}<button onClick={() => setRetry((value) => value+1)}>重试</button></div>}
            {data ? (
                <>
                    <div className="community-total"><span>今日共省</span><strong>{duration(data.totals.savedMs)}</strong><small>{number(data.totals.contributors)} 位贡献者</small></div>
                    <ol className="community-ranking" aria-label={ranking === "saved" ? "今日节省时间榜" : ranking === "submissions" ? "今日贡献榜" : "今日片段跳过榜"}>
                        {ranking === "saved" ? data.topSaved.map((user, index) => (
                            <li key={user.publicUserID}><span className="community-rank">{index+1}</span><span className="community-name" title={user.userName}>{user.userName}</span><span className="community-value"><strong>{duration(user.savedMs)}</strong><small>{number(user.skips)} 次跳过</small></span></li>
                        )) : ranking === "submissions" ? data.topSubmissions.map((user, index) => (
                            <li key={user.publicUserID}><span className="community-rank">{index+1}</span><span className="community-name" title={user.userName}>{user.userName}</span><span className="community-value"><strong>{number(user.submissions)} 个片段</strong><small>{number(user.videos)} 个视频</small></span></li>
                        )) : data.topSegments.map((segment, index) => {
                            const url = segmentVideoUrl(segment.videoID, segment.startTime, segment.part);
                            const title = segment.title || segment.videoID;
                            return (
                                <li key={segment.uuid}>
                                    <span className="community-rank">{index+1}</span>
                                    <div className="community-segment-info">
                                        {url ? <a href={url} target="_blank" rel="noopener noreferrer" title={title}>{title} ↗</a> : <span title={title}>{title}</span>}
                                        <small>{segment.part ? `P${segment.part} · ` : ""}{segmentTime(segment.startTime)}–{segmentTime(segment.endTime)} · {shortCategoryName(segment.category) || segment.category}</small>
                                    </div>
                                    <span className="community-value"><strong>{number(segment.skips)} 次跳过</strong><small>{duration(segment.savedMs)}</small></span>
                                </li>
                            );
                        })}
                    </ol>
                    {!(ranking === "saved" ? data.topSaved : ranking === "submissions" ? data.topSubmissions : data.topSegments).length && <p className="community-empty">今日暂无数据</p>}
                </>
            ) : loading ? <div className="community-placeholder" aria-label="社区榜单加载中"><div className="skeleton skeleton-number" />{Array.from({length:ranking === "segments" ? 10 : 5},(_,i)=><div className="skeleton skeleton-row" key={i} />)}</div> : null}
            <a className="community-support" href="https://bsbsb.top/donate/" target="_blank" rel="noopener noreferrer">支持项目 ↗</a>
        </section>
    );
}
