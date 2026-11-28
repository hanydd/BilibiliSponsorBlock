import * as React from "react";
import { createRoot, Root } from "react-dom/client";

import Utils from "../utils";
const utils = new Utils();

import SubmissionNoticeComponent, { SubmissionNoticeProps } from "../components/SubmissionNoticeComponent";
import { seekFrameByKeyPressListener } from "../content/hotkeyHandler";

class SubmissionNotice {
    noticeRef: React.MutableRefObject<SubmissionNoticeComponent>;

    noticeElement: HTMLDivElement;

    root: Root;

    constructor(props: Omit<SubmissionNoticeProps, "closeListener">) {
        this.noticeRef = React.createRef();

        const referenceNode = utils.findReferenceNode();

        this.noticeElement = document.createElement("div");
        this.noticeElement.id = "submissionNoticeContainer";

        referenceNode.prepend(this.noticeElement);

        this.root = createRoot(this.noticeElement);
        this.root.render(
            <SubmissionNoticeComponent
                {...props}
                ref={this.noticeRef}
                closeListener={() => this.close(false)}
            />
        );
    }

    update(): void {
        this.noticeRef.current?.forceUpdate();
    }

    close(callRef = true): void {
        if (callRef) this.noticeRef.current?.cancel();
        this.root.unmount();

        this.noticeElement.remove();

        document.removeEventListener("keydown", seekFrameByKeyPressListener);
    }

    submit(): void {
        this.noticeRef.current?.submit?.();
    }

    scrollToBottom(): void {
        this.noticeRef.current?.scrollToBottom?.();
    }
}

export default SubmissionNotice;
