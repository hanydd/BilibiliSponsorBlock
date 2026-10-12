/** @jest-environment node */
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { validateOtaDirectory } from "../scripts/validate-ota";
import { parseOtaConfig } from "../src/config/otaConfig";

test("随包目录通过发布校验", () => {
    expect(validateOtaDirectory("ota").configs.sponsorRegex.schemaVersion).toBe(1);
});

test.each<[number, boolean]>([[28, true], [29, false], [30, false]])(
    "客户端和发布校验从完整响应根计算深度：嵌套 %s，接受 %s",
    (nesting, accepted) => {
        let data: Record<string, unknown> = { leaf: "ok" };
        for (let index = 0; index < nesting; index++) data = { next: data };
        const file = { schemaVersion: 1, data };
        const directory = mkdtempSync(join(tmpdir(), "ota-depth-"));
        try {
            writeFileSync(join(directory, "otherConfig.json"), JSON.stringify(file));
            const response = JSON.stringify({ schemaVersion: 1, configs: { otherConfig: file } });
            if (accepted) {
                expect(parseOtaConfig(response).configs.otherConfig).toBeDefined();
                expect(validateOtaDirectory(directory).configs.otherConfig).toBeDefined();
            } else {
                expect(() => parseOtaConfig(response)).toThrow("Invalid OTA config");
                expect(() => validateOtaDirectory(directory)).toThrow("Invalid OTA config");
            }
        } finally { rmSync(directory, { recursive: true, force: true }); }
    }
);

test("自动发现新 JSON 文件，拒绝符号链接和坏配置", () => {
    const directory = mkdtempSync(join(tmpdir(), "ota-validation-"));
    try {
        writeFileSync(join(directory, "otherConfig.json"), JSON.stringify({ schemaVersion: 1, data: { enabled: true } }));
        expect(Object.keys(validateOtaDirectory(directory).configs)).toEqual(["otherConfig"]);
        symlinkSync(join(directory, "otherConfig.json"), join(directory, "linkedConfig.json"));
        expect(() => validateOtaDirectory(directory)).toThrow("Invalid OTA file");
        rmSync(join(directory, "linkedConfig.json"));
        const rules = JSON.parse(readFileSync("ota/sponsorRegex.json", "utf8"));
        rules.data.rules[0].pattern = "(";
        writeFileSync(join(directory, "sponsorRegex.json"), JSON.stringify(rules));
        expect(() => validateOtaDirectory(directory)).toThrow("Invalid sponsor regex");
    } finally { rmSync(directory, { recursive: true, force: true }); }
});
