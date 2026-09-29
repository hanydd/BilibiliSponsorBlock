/** Measurements are bottom-to-top. An upper card's detail occupies the gap below it. */
export function stackOffsets(cards: readonly { header: number; detailGap: number }[], reserve: number, gap: number): number[] {
    let offset = reserve;
    return cards.map((card, index) => {
        if (index > 0) offset += cards[index - 1].header + gap + card.detailGap;
        return offset;
    });
}

/** CSS and disposal scheduling consume the same durations. */
export const stackMotion = { move: 320, exit: 160, settle: 480 } as const;

/** Trim the virtual viewport to occupied card bounds; reserves stay in the math. */
export function occupiedViewport(available: number, bounds: readonly { top: number; bottom: number }[]): { top: number; bottom: number } {
    if (!bounds.length) return { top: 0, bottom: 0 };
    return {
        top: Math.max(0, Math.min(available, ...bounds.map(bound => bound.top))),
        bottom: Math.max(0, Math.min(available, ...bounds.map(bound => available - bound.bottom))),
    };
}
