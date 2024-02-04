/**
 * @jest-environment jsdom
 */

import { ActionType, Category, SegmentUUID, SponsorSourceType, SponsorTime } from "../src/types";
import { exportTimes } from "../src/utils/exporter";

describe("Export segments", () => {
    it("Some segments", () => {
        const segments: SponsorTime[] = [{
            segment: [20, 20],
            category: "poi_highlight" as Category,
            actionType: ActionType.Poi,
            description: "Highlight",
            source: SponsorSourceType.Server,
            UUID: "2" as SegmentUUID
        }, {
            segment: [30, 40],
            category: "sponsor" as Category,
            actionType: ActionType.Skip,
            description: "Sponsor", // Force a description since chrome is not defined
            source: SponsorSourceType.Server,
            UUID: "3" as SegmentUUID
        }, {
            segment: [50, 60],
            category: "selfpromo" as Category,
            actionType: ActionType.Mute,
            description: "Selfpromo",
            source: SponsorSourceType.Server,
            UUID: "4" as SegmentUUID
        }, {
            segment: [0, 0],
            category: "selfpromo" as Category,
            actionType: ActionType.Full,
            description: "Selfpromo",
            source: SponsorSourceType.Server,
            UUID: "5" as SegmentUUID
        }, {
            segment: [80, 90],
            category: "interaction" as Category,
            actionType: ActionType.Skip,
            description: "Interaction",
            source: SponsorSourceType.YouTube,
            UUID: "6" as SegmentUUID
        }];

        const result = exportTimes(segments);

        expect(result).toBe(
            "0:20.000 Highlight\n" +
            "0:30.000 - 0:40.000 Sponsor"
        );
    });

});
