/** One-use decisions are scoped to a video/part, never to a page-wide storage flag. */
export class UpcomingSkipDecision {
    private scope: string;
    private cancelled = new Set<string>();

    private useScope(scope: string): void {
        if (scope !== this.scope) { this.scope = scope; this.cancelled.clear(); }
    }

    set(scope: string, ids: readonly string[], enabled: boolean): void {
        this.useScope(scope);
        for (const id of ids) {
            if (enabled) this.cancelled.delete(id);
            else this.cancelled.add(id);
        }
    }

    consume(scope: string, ids: readonly string[]): boolean {
        this.useScope(scope);
        const cancelled = ids.some(id => this.cancelled.has(id));
        ids.forEach(id => this.cancelled.delete(id));
        return cancelled;
    }
}

export const upcomingSkipDecision = new UpcomingSkipDecision();
