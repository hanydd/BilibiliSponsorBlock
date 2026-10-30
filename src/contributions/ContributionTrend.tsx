import * as React from "react";
import { ContributionStats, contributionTrendPoints, duration, number } from "./model";

export default function ContributionTrend({data}: {data: ContributionStats}) {
    const [range,setRange]=React.useState(30);
    const [metric,setMetric]=React.useState<"skips"|"savedMs">("skips");
    const [hovered,setHovered]=React.useState<string|null>(null);
    const [selected,setSelected]=React.useState<string|null>(null);
    const host=React.useRef<HTMLDivElement>(null);
    const [width,setWidth]=React.useState(800);
    React.useEffect(()=>{
        const observer=new ResizeObserver(([entry])=>setWidth(Math.max(240,entry.contentRect.width)));
        if(host.current) observer.observe(host.current);
        return ()=>observer.disconnect();
    },[]);
    const points=contributionTrendPoints(data,range);
    const maximum=Math.max(metric==="skips"?2:2000,...points.map(point=>point[metric]??0));
    const x=(i:number)=>60+(points.length===1?0.5:i/Math.max(1,points.length-1))*(width-80);
    const y=(value:number)=>160-value/maximum*120;
    const format=(value:number)=>metric==="skips"?number(Math.round(value)):duration(value);
    const paths:string[]=[];
    const partialPaths:string[]=[];
    let path="";
    points.forEach((point,i)=>{
        if(point[metric]===null){if(path)paths.push(path);path="";}
        else if(point.status==="partial") {
            if(path)paths.push(path);path="";
            const previous=points[i-1];
            if(previous?.[metric]!=null)partialPaths.push(`M${x(i-1)},${y(previous[metric])} L${x(i)},${y(point[metric])}`);
        } else path+=`${path?" L":"M"}${x(i)},${y(point[metric])}`;
    });
    if(path)paths.push(path);
    const active=points.find(point=>point.date===(hovered??selected));
    const todayLabel=`今日截至 ${new Date(data.generatedAt).toLocaleTimeString("zh-CN",{timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit",hour12:false})}`;
    const total=points.reduce((sum,point)=>sum+(point[metric]??0),0);
    return <section className="panel contribution-trend">
        <div className="section-head"><h2>收获趋势</h2><div className="segmented" aria-label="收获时间范围">{[7,30,90].map(days=><button key={days} aria-pressed={range===days} onClick={()=>setRange(days)}>近 {days} 天</button>)}</div></div>
        <div className="trend-toolbar"><div className="segmented" aria-label="收获指标">
            <button aria-pressed={metric==="skips"} onClick={()=>setMetric("skips")}>跳过次数</button>
            <button aria-pressed={metric==="savedMs"} onClick={()=>setMetric("savedMs")}>节省时长</button>
        </div><p>合计 <b>{format(total)}</b>{metric==="skips"?" 次":""}</p></div>
        <div ref={host} className="trend-scroll">
            {points.length===0?<p className="trend-empty">收获记录即将开始</p>:<svg className="trend single-trend" viewBox={`0 0 ${width} 205`} role="group" aria-label={metric==="skips"?"每日跳过次数曲线":"每日节省时长曲线"}>
                {[0,0.5,1].map(fraction=><g key={fraction}><line x1="60" x2={width-20} y1={y(maximum*fraction)} y2={y(maximum*fraction)} className="grid-line"/><text x="50" y={y(maximum*fraction)+4} textAnchor="end">{format(maximum*fraction)}</text></g>)}
                {paths.map((value,i)=><path key={i} d={value} className={`trend-line series-${metric}`}/>)}
                {partialPaths.map((value,i)=><path key={`partial-${i}`} d={value} className={`trend-line series-${metric}`} strokeDasharray="4 4"/>)}
                {points.map((point,i)=>point[metric]===null?null:<g key={point.date} role="button" tabIndex={0} aria-label={`${point.date===data.today?todayLabel:point.date} · ${format(point[metric])}${metric==="skips"?" 次跳过":""}`}
                    onMouseEnter={()=>setHovered(point.date)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(point.date)} onBlur={()=>setHovered(null)} onClick={()=>setSelected(point.date)}
                    onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setSelected(point.date);}if(event.key==="Escape"){setSelected(null);setHovered(null);}}}>
                    <rect x={x(i)-Math.min(14,(width-80)/Math.max(2,points.length)/2)} y="30" width={Math.min(28,(width-80)/Math.max(2,points.length))} height="140" fill="transparent"/>
                    <circle cx={x(i)} cy={y(point[metric])} r={hovered===point.date?5:3} className={`trend-dot ${point.status} series-${metric}`}/>
                </g>)}
                {[...new Set([0,Math.floor((points.length-1)/2),points.length-1])].map(i=><text key={i} x={x(i)} y="190" textAnchor="middle">{points[i].date.slice(5)}</text>)}
            </svg>}
            {active && <div className="chart-caption" aria-live="polite">{active.date===data.today?todayLabel:active.date} · {format(active[metric]??0)}{metric==="skips"?" 次跳过":""}</div>}
        </div>
    </section>;
}
