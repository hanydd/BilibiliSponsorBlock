import { ContentUIRegistryState } from "./types";

function createInitialState(): ContentUIRegistryState {
    return {
        playerButton: null,
        playerButtons: {},
        descriptionPill: null,
        submissionNotice: null,
        skipButtonControlBar: null,
        categoryPill: null,
        previewBar: null,
        selectedSegment: null,
        lastPreviewBarUpdate: null,
    };
}

export class ContentUIRegistry {
    private state = createInitialState();

    getState(): ContentUIRegistryState {
        return this.state;
    }

    patchState(patch: Partial<ContentUIRegistryState>): void {
        this.state = {
            ...this.state,
            ...patch,
        };
    }

    reset(): void {
        this.state = createInitialState();
    }
}
