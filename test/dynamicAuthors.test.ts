/** @jest-environment jsdom */
import { observeDynamicAuthors } from "../src/document/dynamicAuthors";

function item(mid: number, type = "AUTHOR_TYPE_NORMAL"): HTMLElement {
    const element = document.createElement("div");
    element.className = "bili-dyn-item";
    element.innerHTML = '<div class="bili-dyn-item__avatar"></div>';
    element["__vue__"] = { author: { mid, type } };
    return element;
}

let cleanup: () => void;
afterEach(() => { cleanup?.(); document.body.replaceChildren(); });

test("populates existing authors without navigation controls and ignores non-normal authors", () => {
    document.body.innerHTML = '<div class="bili-dyn-list__items"></div>';
    const list = document.querySelector(".bili-dyn-list__items");
    const normal = item(123), official = item(456, "AUTHOR_TYPE_PGC");
    list.append(normal, official);
    cleanup = observeDynamicAuthors();
    expect(normal.querySelector(".bili-dyn-item__avatar").getAttribute("bilisponsor-userid")).toBe("123");
    expect(official.querySelector(".bili-dyn-item__avatar").hasAttribute("bilisponsor-userid")).toBe(false);
});

test("discovers late and replacement lists, tolerates text nodes and stops on cleanup", async () => {
    cleanup = observeDynamicAuthors();
    const list = document.createElement("div");
    list.className = "bili-dyn-list__items";
    const first = item(123);
    list.append(first, document.createTextNode("text"), document.createComment("Vue"));
    document.body.append(list);
    await Promise.resolve();
    expect(first.querySelector(".bili-dyn-item__avatar").getAttribute("bilisponsor-userid")).toBe("123");
    const replacement = list.cloneNode(false) as HTMLElement;
    const second = item(456);
    replacement.append(second);
    list.replaceWith(replacement);
    await Promise.resolve();
    expect(second.querySelector(".bili-dyn-item__avatar").getAttribute("bilisponsor-userid")).toBe("456");
    cleanup();
    const late = item(789);
    replacement.append(late);
    await Promise.resolve();
    expect(late.querySelector(".bili-dyn-item__avatar").hasAttribute("bilisponsor-userid")).toBe(false);
});
