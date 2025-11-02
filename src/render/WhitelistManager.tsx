import * as React from "react";
import { createRoot } from "react-dom/client";
import WhitelistManagerComponent from "../components/options/WhitelistManagerComponent";

class WhitelistManager {
    ref: React.RefObject<WhitelistManagerComponent>;

    constructor(element: Element) {
        this.ref = React.createRef();

        const root = createRoot(element);
        root.render(<WhitelistManagerComponent ref={this.ref} />);
    }

    update(): void {
        this.ref.current?.forceUpdate();
    }
}

export default WhitelistManager;

