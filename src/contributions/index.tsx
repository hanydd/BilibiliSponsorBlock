import { LifetimeOverview, RecentFeedback } from "./ContributionOverview";
import ContributionTrend from "./ContributionTrend";
import CommunityPanel from "./CommunityPanel";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import Config from "../config";
import { getHash } from "../utils/hash";
import { shortCategoryName } from "../utils/categoryUtils";
import { asyncRequestToServer } from "../requests/requests";
import {
    contributionCalendarDates,
    calendarRangeLabel,
    ContributionStats,
    duration,
    intensity,
    number,
    segmentTime,
    segmentVideoUrl,
    isContributionCalendar,
    isContributionStats,
} from "./model";

const categoryLabel = (category: string): string => shortCategoryName(category) || category;
const localToday = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
function Calendar({ data, dates, loading = false }: { data: ContributionStats; dates: string[]; loading?: boolean }) {
    const submissions = data.submissions.filter((d) => d.date >= dates[0] && d.date <= dates[dates.length - 1]);
    const counts = new Map(submissions.map((d) => [d.date, d.count]));
    const initial = data.year === Number(data.today.slice(0, 4)) ? data.today : dates[dates.length - 1];
    const [selected, setSelected] = React.useState(initial);
    const buttons = React.useRef<Record<string, HTMLButtonElement>>({});
    const [hovered, setHovered] = React.useState<string | null>(null);
    const [focused, setFocused] = React.useState<string | null>(null);
    const tooltipDate = loading ? null : hovered ?? focused;
    const tooltipID = React.useId();
    const tooltip = React.useRef<HTMLDivElement>(null);
    const [position, setPosition] = React.useState<{ left: number; top: number } | null>(null);
    React.useLayoutEffect(() => {
        if (!tooltipDate) return undefined;
        const place = () => {
            const button = buttons.current[tooltipDate];
            if (!button || !tooltip.current) return;
            const anchor = button.getBoundingClientRect();
            const box = tooltip.current.getBoundingClientRect();
            const left = Math.max(8, Math.min(window.innerWidth - box.width - 8, anchor.left + anchor.width / 2 - box.width / 2));
            const above = anchor.top - box.height - 8;
            const top = Math.max(8, Math.min(window.innerHeight - box.height - 8, above >= 8 ? above : anchor.bottom + 8));
            setPosition({ left, top });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [tooltipDate, data]);
    React.useEffect(() => {
        const button = buttons.current[selected];
        const scroller = button?.closest(".calendar-scroll") as HTMLElement | null;
        if (!button || !scroller) return undefined;
        const reveal = () => {
            if (selected === dates[dates.length - 1]) scroller.scrollLeft = scroller.scrollWidth;
            else if (scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft +=
                button.getBoundingClientRect().left - scroller.getBoundingClientRect().left - scroller.clientWidth / 2;
        };
        reveal();
        const observer = new ResizeObserver(reveal);
        observer.observe(scroller);
        return () => observer.disconnect();
    }, [selected, dates[0], dates[dates.length - 1]]);
    const offset = (new Date(`${dates[0]}T00:00:00Z`).getUTCDay() + 6) % 7;
    const chosen = data.impact.find((d) => d.date === tooltipDate);
    return (
        <>
            <div className="calendar-scroll">
                <div className="calendar-inner">
                    <div className="month-row" style={{ gridTemplateColumns: `repeat(${Math.ceil((offset + dates.length) / 7)}, minmax(0, 1fr))` }}>
                        {dates.map((date, index) => ({ date, index }))
                            .filter(({ date, index }) => date.endsWith("-01") || (index === 0 && Number(date.slice(8)) <= 21))
                            .map(({ date, index }) => (
                                <span key={date} style={{ gridColumn: `${Math.min(Math.floor((offset + index) / 7) + 1, Math.ceil((offset + dates.length) / 7) - 2)} / span 3`,
                                    textAlign: index > dates.length - 14 ? "right" : undefined }}>
                                    {Number(date.slice(5, 7))}月
                                </span>
                            ))}
                    </div>
                    <div className="calendar-body">
                        <div className="week-labels">
                            {["一", "", "三", "", "五", "", "日"].map((v, i) => (
                                <span key={i}>{v}</span>
                            ))}
                        </div>
                        <div className="heatmap" style={{ gridTemplateColumns: `repeat(${Math.ceil((offset + dates.length) / 7)}, minmax(0, 1fr))` }} aria-label={`${dates[0]} 至 ${dates[dates.length - 1]} 提交日历，方向键选择日期`}>
                            {Array.from({ length: offset }, (_, i) => (
                                <span key={`blank${i}`} />
                            ))}
                            {dates.map((date, i) => (
                                <button
                                    key={date}
                                    ref={(el) => {
                                        buttons.current[date] = el;
                                    }}
                                    className={`day level-${intensity(counts.get(date) ?? 0)} ${date === selected ? "selected" : ""}`}
                                    disabled={loading || date > data.today}
                                    tabIndex={date === selected ? 0 : -1}
                                    aria-label={loading ? `${date}，数据未加载` : `${date}，提交 ${counts.get(date) ?? 0} 个片段`}
                                    aria-pressed={date === selected}
                                    aria-describedby={tooltipDate === date ? tooltipID : undefined}
                                    onMouseEnter={() => setHovered(date)}
                                    onMouseLeave={() => setHovered(null)}
                                    onFocus={() => setFocused(date)}
                                    onBlur={() => setFocused(null)}
                                    onClick={() => { setSelected(date); setFocused(date); }}
                                    onKeyDown={(event) => {
                                        if (event.key === "Escape") {
                                            setHovered(null);
                                            setFocused(null);
                                        }
                                        const delta = { ArrowRight: 7, ArrowLeft: -7, ArrowUp: -1, ArrowDown: 1 }[
                                            event.key
                                        ];
                                        if (delta !== undefined) {
                                            event.preventDefault();
                                            setHovered(null);
                                            const next = dates[i + delta];
                                            if (next && next <= data.today) {
                                                setSelected(next);
                                                buttons.current[next]?.focus();
                                            }
                                        }
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <div className="calendar-bottom">
                <div className="legend">
                    少{" "}
                    {[0, 1, 2, 3, 4].map((i) => (
                        <i key={i} className={`level-${i}`} title={["0", "1–2", "3–5", "6–9", "10+"][i]} />
                    ))}{" "}
                    多
                </div>
            </div>
            {tooltipDate && createPortal(
                <div ref={tooltip} id={tooltipID} className="calendar-tooltip" role="tooltip"
                    style={{ ...position, visibility: position ? "visible" : "hidden" }}>
                    <strong>{tooltipDate}</strong>
                    <span>提交 <b>{number(counts.get(tooltipDate) ?? 0)}</b> 个片段</span>
                    {chosen?.skips != null && chosen.savedMs != null && (
                        <span>当天全部片段被跳过 {number(chosen.skips)} 次 · {duration(chosen.savedMs)}</span>
                    )}
                </div>, document.body,
            )}
        </>
    );
}
async function requestCalendar(publicUserID: string, year: number): Promise<Pick<ContributionStats, "submissions">> {
    const response = await asyncRequestToServer("GET", "/api/contributionStats", { publicUserID, year, fields: "calendar" });
    if (response.status !== 200) throw new Error("日历加载失败，请重试。");
    const value: unknown = JSON.parse(response.responseText);
    if (!isContributionCalendar(value, publicUserID, year)) throw new Error("日历数据格式不正确。");
    return value;
}
async function requestContributionStats(publicUserID: string, year: number): Promise<ContributionStats> {
    const response = await asyncRequestToServer("GET", "/api/contributionStats", { publicUserID, year });
    if (response.status !== 200) throw new Error(
        response.status === 404 ? "当前服务器尚未支持“我的贡献”。"
            : response.status === 429 ? "请求过于频繁，请稍后重试。"
                : response.status === 503 ? "统计服务暂不可用，请稍后重试。" : "暂时无法读取贡献数据，请稍后重试。",
    );
    const result: unknown = JSON.parse(response.responseText);
    if (!isContributionStats(result, publicUserID, year)) throw new Error("服务器返回的数据格式不正确。");
    return result;
}

function CalendarPanel({ data, refreshing }: { data: ContributionStats; refreshing: boolean }) {
    const currentYear = Number(data.today.slice(0, 4));
    // null follows the current year even across New Year's midnight.
    const [historicalYear, setHistoricalYear] = React.useState<number | null>(null);
    const year = historicalYear ?? currentYear;
    const [view, setView] = React.useState<{ data: ContributionStats; dates: string[] } | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState("");
    const [retry, setRetry] = React.useState(0);
    React.useEffect(() => {
        let active = true;
        setLoading(true);
        setError("");
        const dates = contributionCalendarDates(year, data.today);
        const years = [...new Set(dates.map((date) => Number(date.slice(0, 4))))];
        void Promise.all(years.map((partYear) => partYear === data.year
            ? Promise.resolve(data) : requestCalendar(data.publicUserID, partYear)))
            .then((parts) => {
                if (active) setView({ data: { ...data, year, submissions: parts.flatMap((part) => part.submissions) }, dates });
            })
            .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "日历加载失败，请重试。"); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [data, year, retry]);
    const dates = view?.dates ?? contributionCalendarDates(year, data.today);
    const calendarData = view?.data ?? { ...data, year, submissions: [] };
    const pending = loading || refreshing;
    const submissions = calendarData.submissions.filter((day) => day.date >= dates[0] && day.date <= dates[dates.length - 1]);
    const total = submissions.reduce((sum, day) => sum + day.count, 0);
    return (
        <section className="panel calendar-panel" aria-busy={pending}>
            <div className="calendar-layout">
                <div className="calendar-content">
                    <div className="section-head">
                        <div className="calendar-title">
                            <h2>提交日历</h2>
                            <span className="calendar-range">{calendarRangeLabel(dates)}</span>
                            <div className="calendar-summary">
                                <strong>{pending ? "—" : number(total)} <span>个片段</span></strong>
                            </div>
                        </div>
                    </div>
                    {error && <div className="calendar-feedback" role="alert">{error}<button onClick={() => setRetry((n) => n + 1)}>重试日历</button></div>}
                    <Calendar key={`${dates[0]}:${dates[dates.length - 1]}`} data={calendarData} dates={dates} loading={pending} />
                </div>
                <nav className="calendar-years" aria-label="日历年份">
                    {Array.from({ length: Math.max(0, currentYear - 2023) }, (_, i) => currentYear - i).map((option) => (
                        <button key={option} aria-pressed={year === option}
                            onClick={() => setHistoricalYear(option === currentYear ? null : option)}>{option}</button>
                    ))}
                </nav>
            </div>
        </section>
    );
}

function LoadingDashboard({ loading }: { loading: boolean }) {
    return (
        <div className="loading-dashboard" aria-busy={loading} aria-label={loading ? "正在加载贡献数据" : "贡献数据尚未加载"}>
            <section className="summary-grid" aria-label="累计贡献">
                {["累计被跳过", "累计为大家节省", "被使用的片段"].map((label) => (
                    <article className="summary-card" key={label}><span>{label}</span><div className="skeleton skeleton-number" /></article>
                ))}
            </section>
            <section className="panel recent-feedback"><div className="section-head"><h2>最近提交</h2></div>{Array.from({ length: 5 }, (_, i) => <div className="skeleton skeleton-row" key={i} />)}</section>
            <section className="panel"><div className="section-head"><h2>收获趋势</h2></div><div className="skeleton skeleton-trend" /></section>
            <section className="details-grid">
                <div className="panel"><div className="section-head"><h2>我的片段</h2></div>{Array.from({ length: 10 }, (_, i) => <div className="skeleton skeleton-row" key={i} />)}</div>
                <div className="panel"><div className="section-head"><h2>社区今日</h2></div><div className="skeleton skeleton-trend" /></div>
            </section>
        </div>
    );
}
function App() {
    const [data, setData] = React.useState<ContributionStats | null>(null);
    const [error, setError] = React.useState("");
    const [loading, setLoading] = React.useState(true);
    const [retry, setRetry] = React.useState(0);
    const [rankingRange,setRankingRange]=React.useState<"lifetime"|"week">("lifetime");
    const [calendarMounted,setCalendarMounted]=React.useState(false);
    const [topMetric, setTopMetric] = React.useState<"bySkips" | "bySavedMs">("bySkips");
    React.useEffect(() => {
        let active = true;
        const applyTheme = () => {
            if (active)
                document.documentElement.dataset.theme = Config.config.darkMode ? "dark" : "light";
        };
        void Config.ready.then(() => {
            if (!active) return;
            applyTheme();
            Config.configSyncListeners.push(applyTheme);
        });
        return () => {
            active = false;
            const index = Config.configSyncListeners.indexOf(applyTheme);
            if (index >= 0) Config.configSyncListeners.splice(index, 1);
        };
    }, []);
    React.useEffect(() => {
        const changed = (changes: Record<string, unknown>) => {
            if (["userID", "serverPreferences", "testingServer", "officialServers"].some((key) => key in changes)) {
                setData(null);
                setRetry((n) => n + 1);
            }
        };
        Config.configSyncListeners.push(changed);
        Config.configLocalListeners.push(changed);
        return () => {
            for (const listeners of [Config.configSyncListeners, Config.configLocalListeners]) {
                const index = listeners.indexOf(changed);
                if (index >= 0) listeners.splice(index, 1);
            }
        };
    }, []);
    React.useEffect(() => {
        let active = true;
        setLoading(true);
        setError("");
        (async () => {
            await Config.ready;
            if (!Config.config.userID) throw new Error("还没有贡献身份。请先在视频页使用空降助手，再打开此页。");
            const publicUserID = await getHash(Config.config.userID);
            const result = await requestContributionStats(publicUserID, Number(localToday().slice(0, 4)));
            if (active) {
                setData(result);
            }
        })()
            .catch((e) => {
                if (active) setError(e instanceof Error ? e.message : "网络连接失败，请稍后重试。");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [retry]);
    React.useEffect(() => {
        if (!data || loading) return undefined;
        const refresh = () => {
            setRetry((n) => n + 1);
        };
        const onVisible = () => {
            if (
                document.visibilityState === "visible" &&
                (localToday() !== data.today || Date.now() - Date.parse(data.generatedAt) >= 300000)
            )
                refresh();
        };
        const nextDay = Date.parse(`${localToday()}T00:00:00+08:00`) + 86400000;
        const timer = window.setTimeout(() => {
            if (document.visibilityState === "visible") refresh();
        }, Math.max(50, nextDay - Date.now() + 50));
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [data, loading]);
    const topSegments = (rankingRange === "lifetime" ? data?.historicalTopSegments : data?.topSegments)?.[topMetric] ?? [];
    return (
        <main>
            <header className="topbar">
                <div className="brand">
                    <img src="../icons/IconSponsorBlocker64px.png" alt="" />
                    空降助手
                </div>
                <nav className="page-links" aria-label="页面导航">
                    <a href="../options/options.html">设置</a>
                    <a href="https://bsbsb.top/" target="_blank" rel="noopener noreferrer">官网 <span aria-hidden="true">↗</span></a>
                </nav>
            </header>
            <section className="intro">
                <div>
                    <h1>我的贡献</h1>
                    <p title={data?.userName}>{data ? `用户：${data.userName}` : "查看提交记录、每日被跳过次数和节省时长。"}</p>
                </div>
                <div className="updated">
                    <span>
                        {data
                            ? `更新于 ${new Date(data.generatedAt).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}`
                            : "—"}
                    </span>
                    <button disabled={loading} onClick={() => setRetry((n) => n + 1)}>
                        刷新数据
                    </button>
            <div className="load-feedback" aria-live="polite" hidden={!error}>
                {error ? (
                    <div role="alert"><span>{error}{data ? " 当前显示上次加载的数据。" : ""}</span><button onClick={() => setRetry((n) => n + 1)}>重新加载</button></div>
                ) : null}
            </div>
                </div>
            </section>
            {!data && <LoadingDashboard loading={loading} />}
            {data && (
                <div className="dashboard" aria-busy={loading}>
                    <LifetimeOverview data={data} />
                    <RecentFeedback key={data.publicUserID} data={data} />
                    <ContributionTrend data={data} />
                    <section className="details-grid">
                        <div className="panel segment-ranking">
                            <div className="section-head">
                                <div>
                                    <h2>我的片段</h2>
                                </div>
                                <div className="ranking-controls">
                                <select aria-label="片段排行范围" value={rankingRange} onChange={event=>setRankingRange(event.target.value as "lifetime"|"week")}>
                                    <option value="lifetime">累计</option><option value="week">近 7 日</option>
                                </select>
                                <select
                                    aria-label="片段排行排序"
                                    value={topMetric}
                                    onChange={(e) => setTopMetric(e.target.value as "bySkips" | "bySavedMs")}
                                >
                                    <option value="bySkips">跳过次数从高到低</option>
                                    <option value="bySavedMs">节省时长从高到低</option>
                                </select>
                                </div>
                            </div>
                            <div className="ranking-scroll">
                                <table aria-label={rankingRange==="lifetime"?"累计片段排行":"近7日片段排行"}>
                                    <thead>
                                        <tr>
                                            <th scope="col">排名</th>
                                            <th scope="col">片段</th>
                                            <th scope="col" aria-sort={topMetric === "bySkips" ? "descending" : "none"}>
                                                被跳过
                                            </th>
                                            <th
                                                scope="col"
                                                aria-sort={topMetric === "bySavedMs" ? "descending" : "none"}
                                            >
                                                节省时长
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {topSegments.map((segment, index) => {
                                            const url = segmentVideoUrl(
                                                segment.videoID,
                                                segment.startTime,
                                                segment.part,
                                            );
                                            return (
                                                <tr key={segment.uuid}>
                                                    <td className="rank-number">{index + 1}</td>
                                                    <td className="segment-info">
                                                        {url ? (
                                                            <a
                                                                href={url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                title={
                                                                    `${segment.title || segment.videoID} · ${segment.part
                                                                        ? `打开第 ${segment.part} P`
                                                                        : "打开视频首页（缺少分P信息）"}`
                                                                }
                                                            >
                                                                {segment.title || segment.videoID} ↗
                                                            </a>
                                                        ) : (
                                                            <span>{segment.videoID}</span>
                                                        )}
                                                        <small>
                                                            {segment.part ? `P${segment.part} · ` : "分P未知 · "}
                                                            {segmentTime(segment.startTime)}–
                                                            {segmentTime(segment.endTime)} ·{" "}
                                                            {categoryLabel(segment.category)}
                                                        </small>
                                                    </td>
                                                    <td>{number(segment.skips)}</td>
                                                    <td>{duration(segment.savedMs)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {!topSegments.length && (
                                <p className="ranking-empty">
                                    {rankingRange==="lifetime"?"还没有片段收获":"近 7 日暂无片段收获"}
                                </p>
                            )}
                        </div>
                        <CommunityPanel refreshToken={retry} />
                    </section>
                    <details className="panel contribution-disclosure calendar-disclosure" onToggle={event=>{if(event.currentTarget.open)setCalendarMounted(true);}}>
                        <summary>提交日历</summary>
                        {calendarMounted && <CalendarPanel data={data} refreshing={loading} />}
                    </details>
                </div>
            )}
            <footer>空降助手 · 我的贡献</footer>
        </main>
    );
}
createRoot(document.getElementById("app")).render(<App />);
