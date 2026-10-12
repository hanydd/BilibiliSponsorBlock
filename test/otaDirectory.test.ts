/** @jest-environment node */
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { validateOtaDirectory } from "../scripts/validate-ota";

test("随包目录通过发布校验", () => {
    expect(validateOtaDirectory("ota").configs.sponsorRegex.schemaVersion).toBe(1);
});

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
