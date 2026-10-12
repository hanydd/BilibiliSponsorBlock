import { lstatSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { parseOtaConfig, OtaConfig, OTA_MAX_FILES, OTA_MAX_FILE_BYTES } from "../src/config/otaConfig";

/** 校验与后端约定的平铺 JSON 目录，并复用客户端的已知配置类型校验。 */
export function validateOtaDirectory(directory: string): OtaConfig {
    const files = readdirSync(directory).filter((file) => file.endsWith(".json")).sort();
    if (!files.length || files.length > OTA_MAX_FILES) throw new Error("Invalid OTA file count");
    const configs: OtaConfig["configs"] = {};
    for (const file of files) {
        const path = join(directory, file);
        const stat = lstatSync(path);
        if (!/^[a-z][a-zA-Z0-9]{0,63}\.json$/.test(file) || !stat.isFile() || stat.size > OTA_MAX_FILE_BYTES) {
            throw new Error(`Invalid OTA file: ${file}`);
        }
        configs[file.slice(0, -5)] = JSON.parse(readFileSync(path, "utf8"));
    }
    return parseOtaConfig(JSON.stringify({ schemaVersion: 1, configs }));
}

if (require.main === module) {
    const config = validateOtaDirectory("ota");
    console.log(`Validated ${Object.keys(config.configs).length} OTA configuration file(s)`);
}
