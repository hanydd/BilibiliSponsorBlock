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
    Impact,
    intensity,
    number,
    segmentTime,
    segmentVideoUrl,
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
                        <span>当天收获 {number(chosen.skips)} 次跳过 · {duration(chosen.savedMs)}</span>
                    )}
                </div>, document.body,
            )}
        </>
    );
}
async function requestContributionStats(publicUserID: string, year: number): Promise<ContributionStats> {
    const response = await asyncRequestToServer("GET", "/api/contributionStats", { publicUserID, year });
    if (response.status !== 200) throw new Error(
        response.status === 404 ? "当前服务器尚未支持贡献日历。"
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
            ? Promise.resolve(data) : requestContributionStats(data.publicUserID, partYear)))
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

function Trend({ points }: { points: Impact[] }) {
    const [selected, setSelected] = React.useState<string | null>(null);
    const [hovered, setHovered] = React.useState<string | null>(null);
    const metrics = ["skips", "savedMs"] as const;
    const maxima = {
        skips: Math.max(2, ...points.map((d) => d.skips ?? 0)),
        savedMs: Math.max(2000, ...points.map((d) => d.savedMs ?? 0)),
    };
    const x = (i: number) => 90 + (i * 800) / Math.max(1, points.length - 1);
    const y = (value: number, metric: typeof metrics[number]) => 155 - (value / maxima[metric]) * 115;
    const paths = (metric: typeof metrics[number]) => {
        const result: string[] = [];
        let path = "";
        points.forEach((d, i) => {
            if (d[metric] === null) {
                if (path) result.push(path);
                path = "";
            } else path += `${path ? " L" : "M"}${x(i)},${y(d[metric], metric)}`;
        });
        if (path) result.push(path);
        return result;
    };
    const point = points.find((d) => d.date === (hovered ?? selected));
    return (
        <>
            <div className="trend-scroll">
                <svg className="trend" viewBox="0 0 980 200" role="group" aria-label="每日跳过次数与节省时长曲线">
                    <text x="90" y="18" className="axis-skips">跳过次数（次）</text>
                    <text x="890" y="18" textAnchor="end" className="axis-savedMs">节省时长</text>
                    {[0, 0.5, 1].map((f) => (
                        <g key={f}>
                            <line x1="90" x2="890" y1={y(maxima.skips * f, "skips")} y2={y(maxima.skips * f, "skips")} className="grid-line" />
                            <text x="78" y={y(maxima.skips * f, "skips") + 4} textAnchor="end">{number(Math.round(maxima.skips * f))}</text>
                            <text x="902" y={y(maxima.savedMs * f, "savedMs") + 4}>{duration(maxima.savedMs * f)}</text>
                        </g>
                    ))}
                    {metrics.map((metric) => paths(metric).map((path, i) => (
                        <path key={`${metric}-${i}`} d={path} className={`trend-line series-${metric}`} />
                    )))}
                    {points.map((d, i) => d.skips === null && d.savedMs === null ? null : (
                        <g key={d.date} role="button" tabIndex={0}
                            aria-label={`${d.date}，${d.skips === null ? "跳过次数未采集" : number(d.skips) + " 次跳过"}，${d.savedMs === null ? "节省时长未采集" : duration(d.savedMs)}${d.status === "partial" ? "，部分日期数据" : ""}`}
                            onFocus={() => setHovered(d.date)} onBlur={() => setHovered(null)}
                            onMouseEnter={() => setHovered(d.date)} onMouseLeave={() => setHovered(null)}
                            onClick={() => setSelected(d.date)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(d.date); }
                            }}>
                            <rect x={x(i) - Math.min(12, 400 / Math.max(1, points.length - 1))} y="28"
                                width={Math.min(24, 800 / Math.max(1, points.length - 1))} height="138" fill="transparent" />
                            {metrics.map((metric) => d[metric] === null ? null : (
                                <circle key={metric} cx={x(i)} cy={y(d[metric], metric)}
                                    r={hovered === d.date ? 5 : 3} className={`trend-dot series-${metric} ${d.status}`} />
                            ))}
                        </g>
                    ))}
                    {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((i) => (
                        <text key={i} x={x(i)} y="185" textAnchor="middle">{points[i]?.date.slice(5)}</text>
                    ))}
                </svg>
            <div className="chart-caption" aria-live="polite" hidden={!point}>
                {point
                    ? `${point.date} · ${point.skips === null ? "跳过次数未采集" : number(point.skips) + " 次跳过"} · ${point.savedMs === null ? "节省时长未采集" : duration(point.savedMs)}${point.status === "partial" ? " · 当天数据不完整" : ""}`
                    : ""}
            </div>
            </div>
        </>
    );
}
function LoadingDashboard({ loading }: { loading: boolean }) {
    return (
        <div className="loading-dashboard" aria-busy={loading} aria-label={loading ? "正在加载贡献数据" : "贡献数据尚未加载"}>
            <section className="summary-grid" aria-label="今日贡献">
                {["今日提交", "所有提交的片段今天收获", "今日为大家节省"].map((label) => (
                    <article className="summary-card" key={label}><span>{label}</span><div className="skeleton skeleton-number" /></article>
                ))}
            </section>
            <section className="panel"><div className="section-head"><h2>提交日历</h2></div><div className="calendar-skeleton-grid" aria-hidden="true">{Array.from({ length: 371 }, (_, i) => <span key={i} />)}</div></section>
            <section className="panel"><div className="section-head"><h2>每日收获</h2></div><div className="skeleton skeleton-trend" /></section>
            <section className="details-grid">
                <div className="panel"><div className="section-head"><h2>近 7 日片段排行</h2></div>{Array.from({ length: 10 }, (_, i) => <div className="skeleton skeleton-row" key={i} />)}</div>
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
    const [range, setRange] = React.useState(30);
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
    const today = data?.impact.find((d) => d.date === data.today);
    const topSegments = data?.topSegments?.[topMetric] ?? [];
    const points = data?.impact.slice(-range) ?? [];
    const valid = points.filter((p) => p.skips !== null);
    return (
        <main>
            <header className="topbar">
                <a href="#" className="brand">
                    <img src="../icons/IconSponsorBlocker64px.png" alt="" />
                    空降助手 <span>/ 我的贡献</span>
                </a>
            </header>
            <section className="intro">
                <div>
                    <h1>我的贡献</h1>
                    <p>{data ? `用户：${data.userName}` : "查看提交记录、每日被跳过次数和节省时长。"}</p>
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
                    <section className="summary-grid" aria-label="今日贡献">
                        <article className="summary-card">
                            <span>今日提交</span>
                            <strong>
                                {number(data.todaySubmissions)} <small>个片段</small>
                            </strong>
                        </article>
                        <article className="summary-card">
                            <span>所有提交的片段今天收获</span>
                            <strong>
                                {today?.skips == null ? "—" : number(today.skips)} <small>次跳过</small>
                            </strong>
                        </article>
                        <article className="summary-card accent">
                            <span>今日为大家节省</span>
                            <strong>{today?.savedMs == null ? "—" : duration(today.savedMs)}</strong>
                        </article>
                    </section>
                    <CalendarPanel data={data} refreshing={loading} />
                    <section className="panel">
                        <div className="section-head">
                            <div>
                                <h2>每日收获</h2>
                            </div>
                            <div className="segmented">
                                {[7, 30, 90].map((n) => (
                                    <button key={n} aria-pressed={range === n} onClick={() => setRange(n)}>
                                        近 {n} 天
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="trend-toolbar">
                            <div className="trend-legend" aria-label="图例">
                                <span><i className="legend-skips" />被跳过次数 · 左轴</span>
                                <span><i className="legend-savedMs" />节省时长 · 右轴</span>
                            </div>
                            <p>
                                已采集日期合计 <b>{number(valid.reduce((n, d) => n + d.skips, 0))}</b> 次 ·{" "}
                                <b>{duration(valid.reduce((n, d) => n + d.savedMs, 0))}</b>
                            </p>
                        </div>
                        <Trend points={points} />
                        <p className="coverage-note">
                            收获数据始于{" "}
                            {new Date(data.collectionStartedAt).toLocaleString("zh-CN", {
                                timeZone: "Asia/Shanghai",
                                hour12: false,
                            })}
                            。首日与今日为部分数据。
                        </p>
                    </section>
                    <section className="details-grid">
                        <div className="panel segment-ranking">
                            <div className="section-head">
                                <div>
                                    <h2>近 7 日片段排行</h2>
                                </div>
                                <select
                                    aria-label="片段排行排序"
                                    value={topMetric}
                                    onChange={(e) => setTopMetric(e.target.value as "bySkips" | "bySavedMs")}
                                >
                                    <option value="bySkips">跳过次数从高到低</option>
                                    <option value="bySavedMs">节省时长从高到低</option>
                                </select>
                            </div>
                            <div className="ranking-scroll">
                                <table aria-label="近7日片段排行">
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
                                    {data.topSegments
                                        ? "近 7 日暂无可展示的片段收获。"
                                        : "当前服务器暂未提供片段排行。"}
                                </p>
                            )}
                        </div>
                        <CommunityPanel refreshToken={retry} />
                    </section>
                </div>
            )}
            <footer>空降助手 · 我的贡献</footer>
        </main>
    );
}
createRoot(document.getElementById("app")).render(<App />);
