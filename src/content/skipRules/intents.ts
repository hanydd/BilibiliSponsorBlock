import { RULES } from './rules';
import { RuleEvent, RuleInput, RulePlan } from './types';

type Command = Extract<RuleEvent, { id: string }>;
type CommandRule = (plan: RulePlan, input: RuleInput, event: Command) => void;
const commands: Record<Command['kind'], CommandRule> = {
    dismiss: (p, _i, e) => { p.state.visits[e.id].excluded = 'dismiss'; p.state.visits[e.id].phase = undefined; },
    deny: (p, _i, e) => { Object.assign(p.state.visits[e.id], { excluded: 'cancel', manual: undefined, phase: 'pending' }); },
    undo: (p, i, e) => {
        commands.deny(p, i, e);
        p.state.visits[e.id].excluded = 'undo';
        const target = i.segments.find(s => s.id === e.id)!;
        if (target.action !== 'mute' || e.forceSeek) p.seek = { time: target.start, ids: [target.id], reason: 'undo' };
    },
    'pause-speed': (p, _i, e) => { Object.assign(p.state.visits[e.id], { excluded: 'pause-speed', phase: 'speed-paused' }); },
    allow: (p, _i, e) => { Object.assign(p.state.visits[e.id], { excluded: undefined, auto: true, phase: undefined }); },
    'resume-speed': (p, i, e) => { commands.allow(p, i, e); p.state.visits[e.id].manual = 'speed'; },
    skip: (p, i, e) => {
        const segment = i.segments.find(s => s.id === e.id)!;
        if (segment.action === 'mute' && !e.forceSeek) {
            Object.assign(p.state.visits[e.id], { excluded: undefined, auto: true, manual: 'mute', phase: 'muted' });
        } else p.seek = { time: segment.end, ids: [segment.id], reason: 'skip' };
    },
};

export function applyUserIntent(plan: RulePlan, input: RuleInput, event: RuleEvent): void {
    if (event.kind === 'user-rate') {
        // A single transition releases every owned member, without restarting peers between commands.
        for (const id of event.ids) {
            if (!plan.state.visits[id]?.inside) continue;
            Object.assign(plan.state.visits[id], { excluded: 'user-rate', phase: 'speed-paused' });
            plan.trace.push({ id, rule: RULES.userRate, result: 'keep-user-rate' });
        }
    } else if ('id' in event && input.segments.some(segment => segment.id === event.id)) {
        plan.trace.push({ id: event.id, rule: RULES.explicit, result: event.kind });
        commands[event.kind](plan, input, event);
    }
}
