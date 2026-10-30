import * as React from "react";
import { createRoot } from "react-dom/client";
import Config from "../config";
import { getHash } from "../utils/hash";
import { asyncRequestToServer } from "../requests/requests";
import {
    calendarDates,
    ContributionStats,
    duration,
    Impact,
    intensity,
    number,
    segmentTime,
    segmentVideoUrl,
    isContributionStats,
} from "./model";

const categoryNames: Record<string, string> = {
    sponsor: "赞助广告",
    selfpromo: "自我推广",
    interaction: "互动提醒",
    intro: "开场片头",
    outro: "结尾片尾",
    filler: "无关内容",
    preview: "预告回顾",
    music_offtopic: "音乐间隙",
};
const categoryLabel = (category: string): string =>
    Object.prototype.hasOwnProperty.call(categoryNames, category) ? categoryNames[category] : category;
const localToday = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
function Calendar({ data }: { data: ContributionStats }) {
    const dates = calendarDates(data.year);
    const counts = new Map(data.submissions.map((d) => [d.date, d.count]));
    const initial = data.year === Number(data.today.slice(0, 4)) ? data.today : dates[dates.length - 1];
    const [selected, setSelected] = React.useState(initial);
    const buttons = React.useRef<Record<string, HTMLButtonElement>>({});
    React.useEffect(() => {
        const button = buttons.current[selected];
        const scroller = button?.closest(".calendar-scroll") as HTMLElement | null;
        if (button && scroller && scroller.scrollWidth > scroller.clientWidth) {
            scroller.scrollLeft +=
                button.getBoundingClientRect().left - scroller.getBoundingClientRect().left - scroller.clientWidth / 2;
        }
    }, [selected]);
    const offset = (new Date(`${dates[0]}T00:00:00Z`).getUTCDay() + 6) % 7;
    const total = data.submissions.reduce((n, d) => n + d.count, 0);
    const active = data.submissions.filter((d) => d.count > 0).length;
    const chosen = data.impact.find((d) => d.date === selected);
    return (
        <>
            <div className="calendar-summary">
                <strong>
                    {number(total)} <span>个片段</span>
                </strong>
                <span>有提交的日期：{active} 天</span>
            </div>
            <div className="calendar-scroll">
                <div className="calendar-inner">
                    <div className="month-row" style={{ gridTemplateColumns: `repeat(${Math.ceil((offset + dates.length) / 7)}, minmax(10px, 1fr))` }}>
                        {Array.from({ length: 12 }, (_, i) => (
                            <span
                                key={i}
                                style={{
                                    gridColumn:
                                        Math.floor(
                                            (offset +
                                                dates.indexOf(`${data.year}-${String(i + 1).padStart(2, "0")}-01`)) /
                                                7,
                                        ) + 1,
                                }}
                            >
                                {i + 1}月
                            </span>
                        ))}
                    </div>
                    <div className="calendar-body">
                        <div className="week-labels">
                            {["一", "", "三", "", "五", "", "日"].map((v, i) => (
                                <span key={i}>{v}</span>
                            ))}
                        </div>
                        <div className="heatmap" aria-label={`${data.year}年提交日历，方向键选择日期`}>
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
                                    disabled={date > data.today}
                                    tabIndex={date === selected ? 0 : -1}
                                    aria-label={`${date}，提交 ${counts.get(date) ?? 0} 个片段`}
                                    aria-pressed={date === selected}
                                    title={`${date} · ${counts.get(date) ?? 0} 个片段`}
                                    onClick={() => setSelected(date)}
                                    onKeyDown={(event) => {
                                        const delta = { ArrowRight: 7, ArrowLeft: -7, ArrowUp: -1, ArrowDown: 1 }[
                                            event.key
                                        ];
                                        if (delta !== undefined) {
                                            event.preventDefault();
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
                <span>色阶表示提交数量</span>
                <div className="legend">
                    少{" "}
                    {[0, 1, 2, 3, 4].map((i) => (
                        <i key={i} className={`level-${i}`} title={["0", "1–2", "3–5", "6–9", "10+"][i]} />
                    ))}{" "}
                    多
                </div>
            </div>
            <div className="date-detail" aria-live="polite">
                <strong>{selected}</strong>
                <span>
                    提交 <b>{counts.get(selected) ?? 0}</b> 个片段
                </span>
                <span>
                    {chosen?.skips != null
                        ? `当天收获 ${number(chosen.skips)} 次跳过 · ${duration(chosen.savedMs)}`
                        : "当天收获暂无可用数据"}
                </span>
            </div>
        </>
    );
}
function Trend({
    points,
    metric,
    onSelect,
}: {
    points: Impact[];
    metric: "skips" | "savedMs";
    onSelect: (date: string) => void;
}) {
    const [hovered, setHovered] = React.useState<string | null>(null);
    const max = Math.max(metric === "skips" ? 2 : 2000, ...points.map((d) => d[metric] ?? 0));
    const x = (i: number) => 60 + (i * 890) / Math.max(1, points.length - 1);
    const y = (n: number) => 190 - (n / max) * 145;
    const paths: string[] = [];
    let path = "";
    points.forEach((d, i) => {
        if (d[metric] === null) {
            if (path) paths.push(path);
            path = "";
        } else path += `${path ? " L" : "M"}${x(i)},${y(d[metric])}`;
    });
    if (path) paths.push(path);
    const point = points.find((d) => d.date === hovered);
    return (
        <>
            <div className="trend-scroll">
                <svg
                    className="trend"
                    viewBox="0 0 980 235"
                    role="group"
                    aria-label={metric === "skips" ? "每日被跳过次数曲线" : "每日节省时长曲线"}
                >
                    {[0, 0.5, 1].map((f) => (
                        <g key={f}>
                            <line x1="60" x2="950" y1={y(max * f)} y2={y(max * f)} className="grid-line" />
                            <text x="48" y={y(max * f) + 4} textAnchor="end">
                                {metric === "skips"
                                    ? number(Math.round(max * f))
                                    : duration(max * f)}
                            </text>
                        </g>
                    ))}
                    {paths.map((p, i) => (
                        <path key={i} d={p} className="trend-line" />
                    ))}
                    {points.map((d, i) =>
                        d[metric] === null ? null : (
                            <g
                                key={d.date}
                                role="button"
                                tabIndex={0}
                                aria-label={`${d.date}，${metric === "skips" ? d.skips + " 次跳过" : duration(d.savedMs)}${d.status === "partial" ? "，部分日期数据" : ""}`}
                                onFocus={() => setHovered(d.date)}
                                onMouseEnter={() => setHovered(d.date)}
                                onMouseLeave={() => setHovered(null)}
                                onClick={() => onSelect(d.date)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        onSelect(d.date);
                                    }
                                }}
                            >
                                <circle cx={x(i)} cy={y(d[metric])} r="13" fill="transparent" />
                                <circle
                                    cx={x(i)}
                                    cy={y(d[metric])}
                                    r={hovered === d.date ? 5 : 3}
                                    className={`trend-dot ${d.status}`}
                                >
                                    <title>{d.date}</title>
                                </circle>
                            </g>
                        ),
                    )}
                    {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((i) => (
                        <text key={i} x={x(i)} y="220" textAnchor="middle">
                            {points[i]?.date.slice(5)}
                        </text>
                    ))}
                </svg>
            </div>
            <div className="chart-caption" aria-live="polite">
                {point
                    ? `${point.date} · ${number(point.skips)} 次跳过 · ${duration(point.savedMs)}${point.status === "partial" ? " · 当天数据不完整" : ""}`
                    : "悬停或聚焦查看数值，点击日期查看收获。空缺表示未采集，不代表零。"}
            </div>
        </>
    );
}
function App() {
    const [year, setYear] = React.useState(Number(localToday().slice(0, 4)));
    const [data, setData] = React.useState<ContributionStats | null>(null);
    const [error, setError] = React.useState("");
    const [loading, setLoading] = React.useState(true);
    const [retry, setRetry] = React.useState(0);
    const [range, setRange] = React.useState(30);
    const [topMetric, setTopMetric] = React.useState<"bySkips" | "bySavedMs">("bySkips");
    const [metric, setMetric] = React.useState<"skips" | "savedMs">("skips");
    const [selected, setSelected] = React.useState(localToday());
    const [theme, setTheme] = React.useState("settings");
    React.useEffect(() => {
        let active = true;
        const applyTheme = () => {
            if (active)
                document.documentElement.dataset.theme =
                    theme === "settings" ? (Config.config.darkMode ? "dark" : "light") : theme;
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
    }, [theme]);
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
        setData(null);
        (async () => {
            await Config.ready;
            if (!Config.config.userID) throw new Error("还没有贡献身份。请先在视频页使用空降助手，再打开此页。");
            const publicUserID = await getHash(Config.config.userID);
            const response = await asyncRequestToServer("GET", "/api/contributionStats", { publicUserID, year });
            if (response.status !== 200)
                throw new Error(
                    response.status === 404
                        ? "当前服务器尚未支持贡献日历。"
                        : response.status === 429
                          ? "请求过于频繁，请稍后重试。"
                          : response.status === 503
                            ? "统计服务暂不可用，请稍后重试。"
                            : "暂时无法读取贡献数据，请稍后重试。",
                );
            const result: unknown = JSON.parse(response.responseText);
            if (!isContributionStats(result, publicUserID, year)) throw new Error("服务器返回的数据格式不正确。");
            if (active) {
                setData(result);
                setSelected(result.today);
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
    }, [year, retry]);
    React.useEffect(() => {
        if (!data || loading) return undefined;
        const refresh = () => {
            const currentYear = Number(localToday().slice(0, 4));
            setYear((previous) => (previous === Number(data.today.slice(0, 4)) ? currentYear : previous));
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
    const chosen = data?.impact.find((d) => d.date === selected);
    const recent = data?.impact.slice(-7) ?? [];
    const topSegments = data?.topSegments?.[topMetric] ?? [];
    const points = data?.impact.slice(-range) ?? [];
    const valid = points.filter((p) => p.skips !== null);
    const recentCategory = data?.categories.filter((d) => d.date === selected) ?? [];
    return (
        <main>
            <header className="topbar">
                <a href="#" className="brand">
                    <img src="../icons/IconSponsorBlocker64px.png" alt="" />
                    空降助手 <span>/ 我的贡献</span>
                </a>
                <label className="theme-label">
                    外观{" "}
                    <select aria-label="外观" value={theme} onChange={(e) => setTheme(e.target.value)}>
                        <option value="settings">跟随设置</option>
                        <option value="light">浅色</option>
                        <option value="dark">深色</option>
                    </select>
                </label>
            </header>
            <section className="intro">
                <div>
                    <h1>我的贡献</h1>
                    <p>{data ? `用户：${data.userName}` : "查看提交记录、每日被跳过次数和节省时长。"}</p>
                </div>
                <div className="updated">
                    北京时间 · 数据可能延迟约 5 分钟
                    <br />
                    {data
                        ? `更新于 ${new Date(data.generatedAt).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}`
                        : "读取贡献数据"}
                    <br />
                    <button disabled={loading} onClick={() => setRetry((n) => n + 1)}>
                        刷新数据
                    </button>
                </div>
            </section>
            {error && (
                <section className="state" role="alert">
                    <h2>贡献数据加载失败</h2>
                    <p>{error}</p>
                    <button onClick={() => setRetry((n) => n + 1)}>重新加载</button>
                </section>
            )}
            {loading && (
                <section className="state" role="status">
                    正在加载贡献数据…
                </section>
            )}
            {data && (
                <>
                    <section className="summary-grid" aria-label="今日贡献">
                        <article className="summary-card">
                            <span>今日提交</span>
                            <strong>
                                {number(data.todaySubmissions)} <small>个片段</small>
                            </strong>
                            <p>按提交日期统计</p>
                        </article>
                        <article className="summary-card">
                            <span>今日被跳过次数</span>
                            <strong>
                                {today?.skips == null ? "—" : number(today.skips)} <small>次</small>
                            </strong>
                            <p>你的片段收到的跳过上报次数</p>
                        </article>
                        <article className="summary-card accent">
                            <span>今日节省时长</span>
                            <strong>{today?.savedMs == null ? "—" : duration(today.savedMs)}</strong>
                            <p>按片段长度估算，今日尚未结束</p>
                        </article>
                    </section>
                    <section className="panel">
                        <div className="section-head">
                            <div>
                                <h2>提交日历</h2>
                                <p>按日期查看提交数量，支持键盘方向键切换。</p>
                            </div>
                            <select
                                aria-label="日历年份"
                                value={year}
                                onChange={(e) => setYear(Number(e.target.value))}
                            >
                                {Array.from(
                                    { length: Number(data.today.slice(0, 4)) - 2019 },
                                    (_, i) => Number(data.today.slice(0, 4)) - i,
                                ).map((y) => (
                                    <option key={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                        <Calendar key={year} data={data} />
                    </section>
                    <section className="panel">
                        <div className="section-head">
                            <div>
                                <h2>每日收获</h2>
                                <p>按跳过发生日期统计，包含此前提交的片段。</p>
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
                            <div className="segmented">
                                <button aria-pressed={metric === "skips"} onClick={() => setMetric("skips")}>
                                    被跳过次数
                                </button>
                                <button aria-pressed={metric === "savedMs"} onClick={() => setMetric("savedMs")}>
                                    节省时长
                                </button>
                            </div>
                            <p>
                                已采集日期合计 <b>{number(valid.reduce((n, d) => n + d.skips, 0))}</b> 次 ·{" "}
                                <b>{duration(valid.reduce((n, d) => n + d.savedMs, 0))}</b>
                            </p>
                        </div>
                        <Trend points={points} metric={metric} onSelect={setSelected} />
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
                                    <p>按近 7 日收获排序，展示前 10 个片段。</p>
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
                                                                    segment.part
                                                                        ? `打开第 ${segment.part} P`
                                                                        : "打开视频首页（缺少分P信息）"
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
                            <p className="ranking-note">
                                {data.detailStart} 至 {data.today}
                                （含今日）。只展示当前可见且有效的片段；已删除或隐藏片段的收获仍保留在每日合计中。片段范围与类型为当前信息。
                            </p>
                        </div>
                        <div className="panel">
                            <div className="section-head">
                                <div>
                                    <h2>{selected.slice(5)} 的收获</h2>
                                    <p>{chosen?.status === "partial" ? "当天数据不完整" : "按片段类型汇总"}</p>
                                    <select
                                        className="detail-date"
                                        aria-label="分类统计日期"
                                        value={selected}
                                        onChange={(e) => setSelected(e.target.value)}
                                    >
                                        {!recent.some((d) => d.date === selected) && (
                                            <option value={selected}>{selected}</option>
                                        )}
                                        {[...recent].reverse().map((d) => (
                                            <option key={d.date} value={d.date}>
                                                {d.date}
                                                {d.date === data.today ? " 今天" : ""}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            {selected < data.detailStart ? (
                                <p className="empty-detail">
                                    分类细节仅展示最近七天。
                                    {chosen?.skips != null &&
                                        `当天共 ${number(chosen.skips)} 次跳过，节省 ${duration(chosen.savedMs)}。`}
                                </p>
                            ) : chosen?.skips === null ? (
                                <p className="empty-detail">这一天还没有开始采集收获数据。</p>
                            ) : recentCategory.length ? (
                                recentCategory.map((c) => (
                                    <div className="category" key={c.category}>
                                        <div>
                                            <span>{categoryLabel(c.category)}</span>
                                            <strong>{duration(c.savedMs)}</strong>
                                        </div>
                                        <div className="bar">
                                            <i
                                                style={{
                                                    width: `${Math.max(2, (c.skips / Math.max(1, chosen?.skips ?? 0)) * 100)}%`,
                                                }}
                                            />
                                        </div>
                                        <small>{number(c.skips)} 次跳过</small>
                                    </div>
                                ))
                            ) : (
                                <p className="empty-detail">所选日期暂无跳过记录。</p>
                            )}
                        </div>
                    </section>
                    <details className="method">
                        <summary>统计说明</summary>
                        <p>
                            提交日历按北京时间统计数据库中仍保留的片段，包含隐藏或被投反对票的提交；已删除片段不在其中。每日收获按服务器收到跳过上报的日期计算，包含旧片段在当天带来的收获，不代表观看人数。节省时长是按片段长度与服务端上限估算的。当前只展示
                            Bilibili 数据。
                        </p>
                        <p>
                            最近七天是本页的分类与片段排行展示范围，不表示历史日汇总会在七天后删除。未采集日期不参与合计，不能与已有累计贡献直接对账。
                        </p>
                    </details>
                </>
            )}
            <footer>空降助手 · 我的贡献</footer>
        </main>
    );
}
createRoot(document.getElementById("app")).render(<App />);
