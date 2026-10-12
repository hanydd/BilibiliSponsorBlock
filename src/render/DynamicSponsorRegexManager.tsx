import * as React from "react";
import { createRoot } from "react-dom/client";
import DynamicSponsorRegexManagerComponent from "../components/options/DynamicSponsorRegexManagerComponent";

class DynamicSponsorRegexManager {
    ref: React.RefObject<DynamicSponsorRegexManagerComponent>;

    constructor(element: Element) {
        this.ref = React.createRef();

        const root = createRoot(element);
        root.render(<DynamicSponsorRegexManagerComponent ref={this.ref} />);
    }

    update(): void {
        this.ref.current?.update();
    }
}

export default DynamicSponsorRegexManager;
