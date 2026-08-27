/** @jest-environment jsdom */

import { getControls, getLeftControls } from "../src/utils/pageUtils";

describe("player control lookup", () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    test("selects both sides from the last non-preview player", () => {
        document.body.innerHTML = `
            <div class="bpx-player-control-bottom-left" data-player="stale"></div>
            <div class="bpx-player-control-bottom-right" data-player="stale"></div>
            <div class="v-recommend-inline-player">
                <div class="bpx-player-control-bottom-left" data-player="preview"></div>
                <div class="bpx-player-control-bottom-right" data-player="preview"></div>
            </div>
            <div class="bpx-player-control-bottom-left" data-player="main"></div>
            <div class="bpx-player-control-bottom-right" data-player="main"></div>
        `;

        expect(getLeftControls()?.dataset.player).toBe("main");
        expect(getControls()?.dataset.player).toBe("main");
    });
});
