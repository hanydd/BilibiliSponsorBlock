import * as React from "react";
import { createRoot } from "react-dom/client";

import { CategoryChooserComponent, DynamicSponsorChooserComponent } from "../components/options/CategoryChooserComponent";

class CategoryChooser {
    ref: React.RefObject<CategoryChooserComponent>;

    constructor(element: Element) {
        this.ref = React.createRef();

        const root = createRoot(element);
        root.render(<CategoryChooserComponent ref={this.ref} />);
    }

    update(): void {
        this.ref.current?.forceUpdate();
    }
}

class DynamicSponsorChooser {
    ref: React.RefObject<DynamicSponsorChooserComponent>;

    constructor(element: Element) {
        this.ref = React.createRef();

        const root = createRoot(element);
        root.render(<DynamicSponsorChooserComponent ref={this.ref} />);
    }

    update(): void {
        this.ref.current?.forceUpdate();
    }
}

export {CategoryChooser, DynamicSponsorChooser};
