import * as React from "react";

export default function ContributionEntry({ dismissed, onDismiss }: { dismissed: boolean; onDismiss: () => void }) {
    const [open, setOpen] = React.useState(false);
    const button = React.useRef<HTMLButtonElement>(null);
    const description = React.useId();
    const close = () => {
        button.current?.focus();
        setOpen(false);
    };
    return <span className="sbContributionEntry"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={event => { if (!event.currentTarget.contains(document.activeElement)) setOpen(false); }}
        onFocusCapture={() => setOpen(true)}
        onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}
        onKeyDown={event => {
            if (event.key === "Escape") { event.stopPropagation(); close(); }
        }}>
        <button ref={button} className="sbContributionCalendar" data-new={!dismissed || undefined} aria-label="我的贡献"
            aria-describedby={open ? description : undefined}
            onClick={() => {
                onDismiss();
                setOpen(false);
                void chrome.runtime.sendMessage({ message: "openPage", url: "contributions/index.html" });
            }}>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <rect x="3" y="4.5" width="14" height="13" rx="2" />
                <path d="M6.5 2.5v4M13.5 2.5v4M3 8.5h14M6 12h2M10 12h2M6 15h2" />
            </svg>
            {!dismissed && <span className="sbContributionNew" aria-hidden="true" />}
        </button>
        {open && <span className="sbContributionHint">
            <strong>我的贡献</strong>
            <span id={description}>查看提交记录和收获</span>
            {!dismissed && <button className="sbContributionDismiss" aria-label="不再显示我的贡献的新功能提示"
                onClick={() => { onDismiss(); close(); }}>不再提示</button>}
        </span>}
    </span>;
}
