import * as React from 'react';
import { createRoot } from 'react-dom/client';
import Config from '../../config';
import { ruleDefinitions } from '../../content/skipRules/rules';
import { Policy } from '../../content/skipRules/types';
import { Action, advance, available, cards, CardView, groups, InputEvent, Layout, makeSimulation, Mode, modes, operations, Result, rows, scenario, StateName, step } from './model';
import { currentSettings, SettingsPanel } from './SettingsPanel';
import { SettingsViewSwitch } from './SettingsViewSwitch';
import { message, playbackText, ruleDescription, ruleInfo, ruleName, settingName, t, traceText } from './text';

type Tab = 'segments' | 'matrix' | 'simulator' | 'rules';
type Preset = 'pause' | 'pauseSpeed' | 'rate' | 'close' | 'adjacent' | 'merge';
const tabs: Tab[] = ['segments', 'matrix', 'simulator', 'rules'];
const ruleIds = Object.keys(ruleDefinitions);
const formatTime = (time: number) => Number(time.toFixed(1)) + 's';
function clockText(card: CardView): string {
    return (card.clock.kind === 'display' ? t('displayTime') : t(card.clock.boundary === 'start' ? 'mediaStart' : 'mediaEnd')) + ' · ' + t('seconds', String(card.seconds));
}
function Trace({ result, openRule }: { result: Result; openRule: (id: string) => void }): JSX.Element {
    return <div className="rules-trace">{result.trace.map((trace, index) => <div key={index}>
        <button type="button" className="rules-link" onClick={() => openRule(trace.rule)}>{trace.id} · {ruleName(trace.rule)}</button>
        <span>{traceText(trace)}</span></div>)}{result.failed && <p role="alert">{t('failed')}</p>}</div>;
}
function Card({ card, action, hover }: { card: CardView; action?: (event: InputEvent) => void; hover?: (value: boolean) => void }): JSX.Element {
    if (!card.visible) return null;
    const buttons: Array<InputEvent['kind']> = [];
    if (card.phase === 'completed') buttons.push('undo');
    else if (card.phase === 'preview') buttons.push(card.automatic ? 'cancel' : 'allow');
    else { buttons.push('skip'); if (card.phase === 'speeding') buttons.push('cancel'); if (card.phase === 'speed-paused') buttons.push('allow'); }
    return <div className="rules-example-card" data-card={card.id} onPointerEnter={() => hover?.(true)} onPointerLeave={() => hover?.(false)}
        onFocus={() => hover?.(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) hover?.(false); }}>
        <div className="rules-card-header"><span className="rules-shield">▶</span><strong>{card.id} · {t('phase_' + card.label)}</strong>
            {action && buttons.map(kind => <button type="button" key={kind} data-card-action={kind} onClick={() => action({ kind, id: card.id })}>{t('action_' + kind)}</button>)}
            <span title={clockText(card)} className="rules-clock">{card.held ? 'Ⅱ' : t('seconds', String(card.seconds))}</span>
            {action && <button type="button" data-card-action="close" aria-label={t('action_close')} onClick={() => action({ kind: 'close', id: card.id })}>×</button>}</div>
        <div className="rules-card-detail">{clockText(card)}<br />{t('timingDescription')}</div></div>;
}

function RulesPage({ container, category }: { container: HTMLElement; category: HTMLElement }): JSX.Element {
    const [revision, refresh] = React.useReducer(value => value + 1, 0);
    const [active, setActive] = React.useState(!container.closest('.option-group').classList.contains('hidden'));
    const initial = new URLSearchParams(location.search).get('rulesTab') as Tab;
    const [tab, setTab] = React.useState<Tab>(tabs.includes(initial) ? initial : 'segments');
    const [mode, setMode] = React.useState<Mode>('auto');
    const [group, setGroup] = React.useState<typeof groups[number]>('movement');
    const [selectedState, setSelectedState] = React.useState<StateName>('ready');
    const [operation, setOperation] = React.useState<Action>('natural');
    const settings = React.useMemo(currentSettings, [revision]);
    const settingsRef = React.useRef(settings); settingsRef.current = settings;
    const [layout, setLayout] = React.useState<Layout>('single');
    const [second, setSecond] = React.useState<Policy>('manual');
    const [preset, setPreset] = React.useState<Preset>('pause');
    const [failed, setFailed] = React.useState(false);
    const [running, setRunning] = React.useState(false);
    const [simulation, setSimulation] = React.useState<Result>(() => step(makeSimulation(settings, 'auto'), { kind: 'data' }));
    const simulationRef = React.useRef(simulation); simulationRef.current = simulation;
    const failRef = React.useRef(failed); failRef.current = failed;
    const [history, setHistory] = React.useState<Array<{ result: Result; label: string }>>([]);
    const [historyIndex, setHistoryIndex] = React.useState(0);
    const [query, setQuery] = React.useState('');
    const [filter, setFilter] = React.useState('all');
    const [selectedRule, setSelectedRule] = React.useState(ruleIds[0]);
    const [ruleOrigin, setRuleOrigin] = React.useState<Tab>('matrix');
    const categoryTarget = React.useRef<HTMLDivElement>(null);
    const categoryHome = React.useRef(category.parentElement);
    const selected = React.useMemo(() => scenario(settings, mode, selectedState, operation), [settings, mode, selectedState, operation]);

    React.useEffect(() => {
        const listener = () => refresh(); Config.configSyncListeners.push(listener);
        const observer = new MutationObserver(() => setActive(!container.closest('.option-group').classList.contains('hidden')));
        observer.observe(container.closest('.option-group'), { attributes: true, attributeFilter: ['class'] });
        return () => { observer.disconnect(); Config.configSyncListeners = Config.configSyncListeners.filter(callback => callback !== listener); };
    }, [container]);
    React.useEffect(() => {
        if (active && tab === 'segments') categoryTarget.current?.appendChild(category);
        else categoryHome.current.appendChild(category);
        return () => { categoryHome.current.appendChild(category); };
    }, [active, tab, category]);
    React.useEffect(() => { if (!active || tab !== 'simulator') setRunning(false); }, [active, tab]);
    React.useEffect(() => {
        // Keep an ongoing paused test intact when the user changes a resume preference.
        const result = simulationRef.current;
        const state = { ...result.state, settings: { ...settings } };
        const updated = step(state, { kind: 'data', fail: failRef.current });
        simulationRef.current = updated;
        setSimulation(updated);
    }, [settings]);
    React.useEffect(() => {
        if (!running || !active || tab !== 'simulator') return undefined;
        let previous = performance.now();
        const timer = setInterval(() => {
            const now = performance.now(), elapsed = Math.min(0.3, (now - previous) / 1000); previous = now;
            const before = simulationRef.current;
            const result = advance(before.state, elapsed, failRef.current);
            const changed = result.effects.length || JSON.stringify(result.cards.map(c => [c.id, c.phase, c.visible])) !== JSON.stringify(before.cards.map(c => [c.id, c.phase, c.visible]));
            commit(result, t('boundary'), !!changed);
            if (result.state.time >= 40) setRunning(false);
        }, 100);
        return () => clearInterval(timer);
    }, [running, active, tab]);

    function changeTab(next: Tab) {
        setTab(next);
        const url = new URL(location.href); url.searchParams.set('rulesTab', next); historyReplace(url);
    }
    function historyReplace(url: URL) { window.history.replaceState(null, '', url.toString()); }
    function update<K extends keyof typeof Config.config>(key: K, value: typeof Config.config[K]) { Config.config[key] = value; refresh(); }
    function commit(result: Result, label: string, record = true) {
        simulationRef.current = result; setSimulation(result);
        if (record) { setHistory(old => [{ result, label }, ...old].slice(0, 30)); setHistoryIndex(0); }
    }
    function send(event: InputEvent, label?: string) { commit(step(simulationRef.current.state, { ...event, fail: failed }), label ?? t('action_' + event.kind)); }
    function reset(nextMode = mode, nextLayout = layout, nextSecond = second) {
        setRunning(false); setHistory([]);
        commit(step(makeSimulation(settingsRef.current, nextMode, 'preview', nextLayout, nextSecond), { kind: 'data' }), t('initial'));
    }
    function chooseMode(next: Mode) {
        setMode(next);
        const state = rows(next).includes(selectedState) ? selectedState : 'ready'; setSelectedState(state);
        if (!available(next, state, operation)) { setOperation('natural'); setGroup('movement'); }
        reset(next);
    }
    function openRule(id: string) { setRuleOrigin(tab); setSelectedRule(id); setQuery(''); setFilter('all'); changeTab('rules'); }
    function useResult() { setLayout('single'); setRunning(false); setHistory([]); commit(selected, t('initial')); changeTab('simulator'); }
    function loadPreset() {
        setRunning(false); setHistory([]);
        const nextMode: Mode = ['pauseSpeed', 'rate', 'adjacent'].includes(preset) ? 'fast' : 'auto';
        const nextLayout = ['adjacent', 'merge'].includes(preset) ? 'adjacent' : 'single';
        setMode(nextMode); setLayout(nextLayout); setSecond('auto'); setSelectedState('ready'); setOperation('natural'); setGroup('movement');
        const run = (state: ReturnType<typeof makeSimulation>, event: InputEvent) => step(state, { ...event, fail: failed });
        // A prepared paused state tests resume independently of the seek-entry setting.
        let result = preset === 'pause' || preset === 'close' ? run(makeSimulation(settings, nextMode, 'ready'), { kind: 'pause' }) :
            run(makeSimulation(settings, nextMode, 'preview', nextLayout, 'auto'), { kind: 'time', time: 10 });
        if (preset === 'pauseSpeed') result = run(result.state, { kind: 'pause' });
        if (preset === 'rate') result = run(result.state, { kind: 'rate', rate: result.state.rate === 2 ? 1.5 : 2 });
        if (preset === 'close') { result = run(result.state, { kind: 'close' }); result = run(result.state, { kind: 'resume' }); }
        if (preset === 'adjacent') result = run(result.state, { kind: 'time', time: 20 });
        commit(result, t('preset_' + preset));
    }
    function hover(value: boolean) {
        const result = simulationRef.current, state = { ...result.state, hovered: value };
        simulationRef.current = { ...result, state, cards: cards(state) }; setSimulation(simulationRef.current);
    }
    const filtered = ruleIds.filter(id => (filter === 'all' || (filter === 'fixed' ? !ruleInfo(id).settings.length : !!ruleInfo(id).settings.length)) &&
        [ruleName(id), ruleDescription(id), id, ...ruleInfo(id).settings.map(settingName)].join(' ').toLowerCase().includes(query.toLowerCase()));
    const currentRule = filtered.includes(selectedRule) ? selectedRule : filtered[0];
    const modeButtons = <div className="rules-modes"><span>{t('exampleMode')}</span>{modes.map(value => <button type="button" key={value} data-rule-mode={value} aria-pressed={mode === value} onClick={() => chooseMode(value)}>{t('mode_' + value)}</button>)}</div>;
    const activeHistory = history[historyIndex];
    return <div className="rule-page">
        <SettingsViewSwitch view="skip-rules" />
        <header><h2>{t('title')}</h2><span className="rules-engine-status" role="status">{t(Config.config.skipEngineMode === 'rules' ? 'active' : Config.config.skipEngineMode === 'shadow' ? 'shadow' : 'inactive')}</span></header>
        <div className="rules-tabs" role="tablist" aria-label={t('title')} onKeyDown={event => {
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement); if (index < 0) return;
            const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
            if (next >= 0) { event.preventDefault(); buttons[next].focus(); changeTab(tabs[next]); }
        }}>{tabs.map(value => <button type="button" key={value} role="tab" id={'rules-tab-' + value} aria-controls={'rules-panel-' + value} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => changeTab(value)}>{t('tab_' + value)}</button>)}</div>

        <section role="tabpanel" id="rules-panel-segments" aria-labelledby="rules-tab-segments" hidden={tab !== 'segments'}>
            <p>{t('segmentDescription')}</p><div ref={categoryTarget} className="rules-categories" />
            <label className="rules-global-speed"><input type="checkbox" data-rule-setting="enableSpeedUp" checked={Config.config.enableSpeedUp} onChange={e => update('enableSpeedUp', e.target.checked)} />{message('enableSpeedUp')}</label>
            <div className="rules-segment-extras">
                {(['muteSegments', 'fullVideoSegments', 'manualSkipOnFullVideo'] as const).map(key => <label key={key}><input type="checkbox" data-rule-setting={key} checked={Config.config[key]} onChange={e => update(key, e.target.checked)} />{message(key === 'manualSkipOnFullVideo' ? 'enableManualSkipOnFullVideo' : key)}</label>)}
                <label>{message('minDuration')}<input type="number" min="0" step="0.1" data-rule-setting="minDuration" value={Config.config.minDuration} onChange={e => { const value = Number(e.target.value); if (Number.isFinite(value) && value >= 0) update('minDuration', value); }} /></label>
            </div>
            {tab === 'segments' && <SettingsPanel update={update} />}
        </section>
        {(tab === 'matrix' || tab === 'simulator') && <><SettingsPanel update={update} />{modeButtons}<p className="small-description">{t('exampleDescription')}</p></>}
        <section role="tabpanel" id="rules-panel-matrix" aria-labelledby="rules-tab-matrix" hidden={tab !== 'matrix'}>
            <div className="rules-workspace"><div><h3>{t('matrixTitle')}</h3><div className="rules-groups">{groups.map(value => <button type="button" key={value} data-rule-group={value} aria-pressed={group === value} onClick={() => {
                setGroup(value); setOperation(operations.find(o => o.group === value && available(mode, selectedState, o.id))?.id ?? 'natural');
            }}>{t('group_' + value)}</button>)}</div>
                <div className="rules-table-scroll"><table className="rules-matrix"><thead><tr><th>{t('stateAxis')} ↓ / {t('operationAxis')} →</th>{operations.filter(o => o.group === group).map(o => <th key={o.id} title={t('hint_' + o.id)}>{t('op_' + o.id)}</th>)}</tr></thead>
                    <tbody>{rows(mode).map(state => <tr key={state}><th>{t('state_' + state)}<small>{t(state === 'preview' ? 'positionBefore' : state === 'completed' ? 'positionAfter' : state === 'undo' ? 'positionStart' : 'positionInside')}</small></th>{operations.filter(o => o.group === group).map(o => {
                        if (!available(mode, state, o.id)) return <td key={o.id} title={t('notApplicable')}>—</td>;
                        const result = scenario(settings, mode, state, o.id), visible = result.cards.find(c => c.visible);
                        return <td key={o.id}><button type="button" data-state={state} data-operation={o.id} aria-pressed={state === selectedState && o.id === operation} onClick={() => { setSelectedState(state); setOperation(o.id); }}>
                            <strong>{playbackText(result)}</strong><small>{visible ? t('phase_' + visible.label) : t('noCards')}</small></button></td>;
                    })}</tr>)}</tbody></table></div><p className="small-description">{t('matrixNote')}</p></div>
                <aside className="rules-result" aria-live="polite"><h3>{t('result')}</h3><p>{t('mode_' + mode)} · {t('state_' + selectedState)} · {t('op_' + operation)}</p>
                    <dl><dt>{t('video')}</dt><dd>{playbackText(selected)}</dd><dt>{t('card')}</dt><dd>{selected.cards.some(c => c.visible) ? selected.cards.filter(c => c.visible).map(c => c.id + ' · ' + t('phase_' + c.label)).join(' / ') : t('noCards')}</dd>
                        <dt>{t('countdown')}</dt><dd>{selected.cards.some(c => c.visible) ? selected.cards.filter(c => c.visible).map(clockText).join(' / ') : t('noClock')}</dd></dl>
                    <button type="button" className="rules-primary" onClick={useResult}>{t('continueTest')}</button><h3>{t('matched')}</h3><Trace result={selected} openRule={openRule} /></aside>
            </div>
        </section>
        <section role="tabpanel" id="rules-panel-simulator" aria-labelledby="rules-tab-simulator" hidden={tab !== 'simulator'}>
            <div className="rules-toolbar"><p>{t('simulationDescription')}</p><button type="button" onClick={() => reset()}>{t('reset')}</button></div>
            <div className="rules-sim-controls">
                <label>{t('preset')}<select value={preset} onChange={e => setPreset(e.target.value as Preset)}>{(['pause', 'pauseSpeed', 'rate', 'close', 'adjacent', 'merge'] as Preset[]).map(value => <option key={value} value={value}>{t('preset_' + value)}</option>)}</select></label><button type="button" onClick={loadPreset}>{t('loadPreset')}</button>
                <label>{t('layout')}<select data-rules-layout value={layout} onChange={e => { setLayout(e.target.value as Layout); reset(mode, e.target.value as Layout); }}>{(['single', 'adjacent', 'overlap'] as Layout[]).map(value => <option key={value} value={value}>{t('layout_' + value)}</option>)}</select></label>
                {layout !== 'single' && <label>{t('secondMode')}<select value={second} onChange={e => { setSecond(e.target.value as Policy); reset(mode, layout, e.target.value as Policy); }}>{modes.filter(m => m !== 'fast').map(value => <option key={value} value={value}>{t('mode_' + value)}</option>)}</select></label>}
                <label className="rules-check"><input type="checkbox" checked={failed} onChange={e => setFailed(e.target.checked)} />{t('fail')}</label>
            </div>
            <div className="rules-sim-layout"><div className="rules-player">
                <div className="rules-player-meta"><strong data-rules-time>{formatTime(simulation.state.time)}</strong><span>{t(simulation.state.paused ? 'paused' : simulation.state.waiting ? 'buffering' : 'playing')} · {simulation.state.rate}× · {t(simulation.state.ownedRate ? 'ownedRate' : 'userRate')}</span></div>
                <div className="rules-cards">{simulation.cards.filter(c => c.visible).map(card => <Card key={card.id} card={card} action={send} hover={hover} />)}{!simulation.cards.some(c => c.visible) && <p>{t('cardsEmpty')}</p>}</div>
                <div className="rules-timeline">{simulation.state.segments.filter(s => s.mode !== 'ignore').map(s => <div key={s.id} className={'rules-range ' + (s.id === 'B' ? 'second' : '')} style={{ left: s.start / 40 * 100 + '%', width: (s.end - s.start) / 40 * 100 + '%' }}>{s.id} · {t('mode_' + s.mode)}</div>)}<i style={{ left: simulation.state.time / 40 * 100 + '%' }} /></div>
                <div className="rules-ticks">{[0, 10, 20, 30, 40].map(time => <span key={time}>{time}s</span>)}</div>
                <label>{t('timeline')}<input aria-label={t('timeline')} type="range" min="0" max="40" step="0.1" value={simulation.state.time} onChange={e => send({ kind: 'seek', time: Number(e.target.value) }, t('timeline'))} /></label>
                <div className="rules-player-controls"><button type="button" onClick={() => setRunning(!running)}>{t(running ? 'stop' : 'run')}</button><button type="button" onClick={() => send({ kind: 'pause' })}>{t('action_pause')}</button><button type="button" onClick={() => send({ kind: 'resume' })}>{t('action_resume')}</button>
                    <button type="button" onClick={() => commit(advance(simulationRef.current.state, 1, failed), t('advance'))}>{t('advance')}</button><label>{t('rate')}<select value={simulation.state.rate} onChange={e => send({ kind: 'rate', rate: Number(e.target.value) }, t('rate'))}>{Array.from(new Set([1, 1.5, 2, 3, 4, 6, 8, 16, simulation.state.rate])).sort((a, b) => a - b).map(value => <option key={value} value={value}>{value}×</option>)}</select></label></div>
            </div><aside className="rules-history"><h3>{t('history')}</h3><p className="small-description">{t('historyHint')}</p><div className="rules-history-list">{history.map((entry, index) => <button type="button" key={index} aria-pressed={historyIndex === index} onClick={() => setHistoryIndex(index)}>{entry.label}<small>{formatTime(entry.result.from)} → {formatTime(entry.result.state.time)} · {playbackText(entry.result)}</small></button>)}</div>
                <div className="rules-history-detail">{activeHistory ? <><strong>{activeHistory.label}</strong><Trace result={activeHistory.result} openRule={openRule} /></> : <p>{t('historyEmpty')}</p>}</div>
                <div className="rules-extra-actions">{(['buffer', 'playing', 'data'] as const).map(kind => <button type="button" key={kind} onClick={() => send({ kind })}>{t('action_' + kind)}</button>)}<button type="button" onClick={() => send({ kind: 'wall', seconds: 1 }, t('wall'))}>{t('wall')}</button></div>
                <details><summary>{t('timingHelp')}</summary><p>{t('timingDescription')}</p></details>
            </aside></div>
        </section>
        <section role="tabpanel" id="rules-panel-rules" aria-labelledby="rules-tab-rules" hidden={tab !== 'rules'}>
            <p>{t('rulesDescription')}</p><div className="rules-search"><label>{t('search')}<input type="search" placeholder={t('searchPlaceholder')} value={query} onChange={e => setQuery(e.target.value)} /></label><label>{t('filter')}<select value={filter} onChange={e => setFilter(e.target.value)}>{['all', 'configurable', 'fixed'].map(value => <option key={value} value={value}>{t('filter_' + value)}</option>)}</select></label><span role="status">{t('ruleCount', String(filtered.length))}</span></div>
            <div className="rules-browser"><div className="rules-directory">{filtered.map(id => <button type="button" key={id} aria-pressed={currentRule === id} onClick={() => setSelectedRule(id)}>{ruleName(id)}<small>{t('stage_' + ruleInfo(id).stage)} · {ruleInfo(id).settings.length ? t('configurable') : t('filter_fixed')}</small></button>)}</div>
                <div className="rules-description">{currentRule ? <><h3>{ruleName(currentRule)}</h3><p>{ruleDescription(currentRule)}</p><h4>{t('relatedSettings')}</h4><p>{ruleInfo(currentRule).settings.length ? ruleInfo(currentRule).settings.map(settingName).join('、') : t('fixed')}</p>
                    <details><summary>{t('identifier')}</summary><code>{currentRule}</code></details><button type="button" className="rules-link" onClick={() => changeTab(ruleOrigin)}>{t(ruleOrigin === 'simulator' ? 'returnTest' : 'returnMatrix')}</button></> : <p>{t('emptyRules')}</p>}</div>
            </div><details><summary>{t('scope')}</summary><p>{t('scopeDescription')}</p></details>
        </section>
    </div>;
}
export function mountRulesPage(container: HTMLElement, category: HTMLElement): void {
    createRoot(container).render(<RulesPage container={container} category={category} />);
}
