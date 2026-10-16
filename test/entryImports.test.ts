/** @jest-environment node */
import { existsSync, readFileSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import * as ts from "typescript";

/** 追踪 TypeScript 编译后的相对路径 require，排除已被擦除的类型导入。 */
function runtimeDependencies(entry: string): Set<string> {
    const root = resolve("src");
    const visited = new Set<string>();
    const visit = (file: string) => {
        if (visited.has(file)) return;
        visited.add(file);
        const emitted = ts.transpileModule(readFileSync(file, "utf8"), {
            fileName: file,
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, jsx: ts.JsxEmit.React },
        }).outputText;
        for (const match of emitted.matchAll(/require\(["'](\.[^"']+)["']\)/g)) {
            const base = resolve(dirname(file), match[1]);
            const target = [base + ".ts", base + ".tsx", join(base, "index.ts")].find(existsSync);
            if (target?.startsWith(root + "/")) visit(target);
        }
    };
    visit(join(root, entry));
    return new Set([...visited].map((file) => relative(root, file)));
}

test("options 不引入 content、background 或后台请求模块", () => {
    const dependencies = runtimeDependencies("options.ts");
    expect(dependencies.has("content.ts")).toBe(false);
    expect(dependencies.has("background.ts")).toBe(false);
    expect([...dependencies].filter((file) => file.startsWith("requests/background/") || file === "requests/background-request-proxy.ts")).toEqual([]);
});

test("background 不引入 options、content 或页面渲染模块", () => {
    const dependencies = runtimeDependencies("background.ts");
    expect(dependencies.has("content.ts")).toBe(false);
    expect(dependencies.has("options.ts")).toBe(false);
    expect([...dependencies].filter((file) => file.startsWith("components/") || file.startsWith("render/"))).toEqual([]);
});

test("content 不引入后台 OTA 执行模块", () => {
    const dependencies = runtimeDependencies("content.ts");
    expect(dependencies.has("background.ts")).toBe(false);
    expect([...dependencies].filter((file) => file.startsWith("requests/background/"))).toEqual([]);
});
