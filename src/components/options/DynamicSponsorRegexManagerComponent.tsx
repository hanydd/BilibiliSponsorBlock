import * as React from "react";
import Config from "../../config";
import {
    DynamicSponsorRegexRule,
    SPONSOR_REGEX_FLAGS,
    SponsorRegexFlag,
    compileSponsorPattern,
    formatSponsorRuleDate,
    resolveSponsorRuleName,
    sanitizeSponsorRegexFlags,
    todaySponsorRuleDate,
} from "../../utils/sponsorRegex";
import {
    checkSponsorRegexConfigUpdate,
    getDefaultSponsorRegexRules,
    getEffectiveSponsorRegexRules,
    getLatestDefaultUpdateDate,
} from "../../config/sponsorRegexOTA";

export interface DynamicSponsorRegexManagerProps {}

export type SponsorRegexCheckState = "idle" | "checking" | "updated" | "up-to-date" | "failed";

export interface DynamicSponsorRegexManagerState {
    rules: DynamicSponsorRegexRule[];
    flags: string;
    invalidRuleIds: string[];
    checkState: SponsorRegexCheckState;
}

/** 内置词条 = 默认词条（本地 OTA 快照或随包配置），可以修改内容，但不能删除，只能重置 */
function isBuiltinRule(ruleId: string): boolean {
    return getDefaultSponsorRegexRules().some((rule) => rule.id === ruleId);
}

function getBuiltinDefault(ruleId: string): DynamicSponsorRegexRule | undefined {
    return getDefaultSponsorRegexRules().find((rule) => rule.id === ruleId);
}

function getRuleName(rule: DynamicSponsorRegexRule): string {
    const custom = rule.name?.trim();
    if (custom) return custom;

    return resolveSponsorRuleName(rule.locales, chrome.i18n.getUILanguage()) || rule.id;
}

function getInvalidRuleIds(rules: DynamicSponsorRegexRule[], flags: string): string[] {
    return rules
        .filter((rule) => rule.pattern.trim() !== "" && compileSponsorPattern(rule.pattern, flags) === null)
        .map((rule) => rule.id);
}

class DynamicSponsorRegexManagerComponent extends React.Component<
    DynamicSponsorRegexManagerProps,
    DynamicSponsorRegexManagerState
> {
    constructor(props: DynamicSponsorRegexManagerProps) {
        super(props);

        const rules = getEffectiveSponsorRegexRules();
        const flags = sanitizeSponsorRegexFlags(Config.config.dynamicAndCommentSponsorRegexFlags);

        this.state = { rules, flags, invalidRuleIds: getInvalidRuleIds(rules, flags), checkState: "idle" };
    }

    /** 配置被其它页面/设备修改后重新载入（不影响检查结果的展示） */
    update(): void {
        const rules = getEffectiveSponsorRegexRules();
        const flags = sanitizeSponsorRegexFlags(Config.config.dynamicAndCommentSponsorRegexFlags);

        this.setState({ rules, flags, invalidRuleIds: getInvalidRuleIds(rules, flags) });
    }

    render(): React.ReactElement {
        const rules = this.state.rules;
        const enabledCount = rules.filter((rule) => rule.enabled && rule.pattern.trim()).length;

        return (
            <>
                <div className="medium-description" style={{ marginBottom: "5px" }}>
                    <span className="optionLabel">{chrome.i18n.getMessage("dynamicAndCommentSponsorRegexPattern")}</span>
                </div>
                <div className="small-description" style={{ marginBottom: "15px" }}>
                    {chrome.i18n.getMessage("dynamicAndCommentSponsorRegexPatternDescription")}
                </div>

                <label className="input-container">
                    <span className="optionLabel">{chrome.i18n.getMessage("dynamicAndCommentSponsorRegexFlags")}</span>
                    <span style={{ display: "inline-flex", gap: "12px", flexWrap: "wrap" }}>
                        {SPONSOR_REGEX_FLAGS.map((flag) => (
                            <span key={flag} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <input
                                    id={`sponsorRegexFlag_${flag}`}
                                    type="checkbox"
                                    checked={this.state.flags.includes(flag)}
                                    onChange={(event) => this.toggleFlag(flag, event.target.checked)}
                                />
                                <label htmlFor={`sponsorRegexFlag_${flag}`}>
                                    {chrome.i18n.getMessage(`dynamicSponsorRegexFlag_${flag}`)}
                                </label>
                            </span>
                        ))}
                    </span>
                </label>
                <div className="small-description" style={{ marginBottom: "15px" }}>
                    {chrome.i18n.getMessage("dynamicAndCommentSponsorRegexFlagsDescription")}
                </div>

                {rules.length === 0 ? (
                    <div style={{ margin: "15px 0", color: "#888" }}>
                        {chrome.i18n.getMessage("dynamicSponsorRegexRuleEmpty")}
                    </div>
                ) : (
                    <table className="categoryChooserTable" style={{ width: "100%" }}>
                        <thead>
                            <tr className="categoryTableElement categoryTableHeader">
                                <th>{chrome.i18n.getMessage("dynamicSponsorRegexRuleEnabled")}</th>
                                <th>{chrome.i18n.getMessage("dynamicSponsorRegexRuleName")}</th>
                                <th>{chrome.i18n.getMessage("dynamicSponsorRegexRulePattern")}</th>
                                <th>{chrome.i18n.getMessage("dynamicSponsorRegexRuleUpdateDate")}</th>
                                <th>{chrome.i18n.getMessage("dynamicSponsorRegexRuleActions")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rules.map((rule) => (
                                <tr key={rule.id} className="categoryTableElement" data-rule-id={rule.id}>
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={rule.enabled}
                                            onChange={(event) => this.updateRule(rule.id, { enabled: event.target.checked })}
                                        />
                                    </td>
                                    <td>{this.renderName(rule)}</td>
                                    <td>
                                        <input
                                            className="option-text-box"
                                            data-rule-pattern
                                            style={{
                                                width: "100%",
                                                minWidth: "220px",
                                                ...(this.state.invalidRuleIds.includes(rule.id)
                                                    ? { borderColor: "#e06c75" }
                                                    : {}),
                                            }}
                                            type="text"
                                            value={rule.pattern}
                                            spellCheck={false}
                                            placeholder={chrome.i18n.getMessage("dynamicSponsorRegexRulePatternPlaceholder")}
                                            onChange={(event) => this.updateRule(rule.id, { pattern: event.target.value })}
                                        />
                                        {this.state.invalidRuleIds.includes(rule.id) && (
                                            <div className="small-description" style={{ color: "#e06c75" }}>
                                                {chrome.i18n.getMessage("dynamicSponsorRegexRulePatternInvalid")}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ whiteSpace: "nowrap" }}>
                                        {formatSponsorRuleDate(rule.updateAt) ?? "—"}
                                    </td>
                                    <td style={{ whiteSpace: "nowrap" }}>
                                        {isBuiltinRule(rule.id) ? (
                                            <div
                                                className="option-button inline"
                                                style={{ fontSize: "0.9em", padding: "5px 10px" }}
                                                onClick={() => this.resetRule(rule.id)}
                                            >
                                                {chrome.i18n.getMessage("dynamicSponsorRegexRuleReset")}
                                            </div>
                                        ) : (
                                            <div
                                                className="option-button inline"
                                                style={{ fontSize: "0.9em", padding: "5px 10px" }}
                                                onClick={() => this.removeRule(rule.id)}
                                            >
                                                {chrome.i18n.getMessage("dynamicSponsorRegexRuleDelete")}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                <div className="sponsor-regex-rule-actions">
                    <div id="addSponsorRegexRule" className="option-button inline" onClick={this.addCustomRule.bind(this)}>
                        {chrome.i18n.getMessage("dynamicSponsorRegexRuleAdd")}
                    </div>
                    <div
                        id="resetSponsorRegexRules"
                        className="option-button inline"
                        onClick={this.resetAllRules.bind(this)}
                    >
                        {chrome.i18n.getMessage("dynamicSponsorRegexRuleResetAll")}
                    </div>
                    <span className="sponsor-regex-rule-status">
                        {chrome.i18n.getMessage("dynamicSponsorRegexRuleEnabledCount", [String(enabledCount)])}
                    </span>
                </div>

                <div className="sponsor-regex-rule-actions">
                    <div
                        id="checkSponsorRegexUpdate"
                        className="option-button inline"
                        onClick={this.checkRemoteConfig.bind(this)}
                    >
                        {chrome.i18n.getMessage(
                            this.state.checkState === "checking"
                                ? "dynamicSponsorRegexConfigChecking"
                                : "dynamicSponsorRegexConfigCheck"
                        )}
                    </div>
                    <span id="sponsorRegexConfigStatus" className="sponsor-regex-rule-status">
                        {this.renderConfigStatus()}
                    </span>
                </div>
            </>
        );
    }

    /** 状态栏：检查结果优先，否则展示当前默认词条的来源与最近更新日期 */
    private renderConfigStatus(): string {
        const latestDate = getLatestDefaultUpdateDate() ?? "";

        switch (this.state.checkState) {
            case "updated":
                return chrome.i18n.getMessage("dynamicSponsorRegexConfigUpdated", [
                    String(getDefaultSponsorRegexRules().length),
                ]);
            case "up-to-date":
                return chrome.i18n.getMessage("dynamicSponsorRegexConfigUpToDate");
            case "failed":
                return chrome.i18n.getMessage("dynamicSponsorRegexConfigFailed");
            case "checking":
                return chrome.i18n.getMessage("dynamicSponsorRegexConfigChecking");
            case "idle":
            default: {
                const remote = Config.local?.sponsorRegexRemoteConfig;
                return remote
                    ? chrome.i18n.getMessage("dynamicSponsorRegexConfigSourceRemote", [latestDate])
                    : chrome.i18n.getMessage("dynamicSponsorRegexConfigSourceBuiltin", [latestDate]);
            }
        }
    }

    private renderName(rule: DynamicSponsorRegexRule): React.ReactNode {
        if (isBuiltinRule(rule.id)) return getRuleName(rule);

        return (
            <input
                className="option-text-box"
                data-rule-name
                style={{ width: "100%", minWidth: "100px" }}
                type="text"
                value={rule.name ?? ""}
                placeholder={chrome.i18n.getMessage("dynamicSponsorRegexRuleNamePlaceholder")}
                onChange={(event) => this.updateRule(rule.id, { name: event.target.value })}
            />
        );
    }

    private async checkRemoteConfig(): Promise<void> {
        if (this.state.checkState === "checking") return;

        this.setState({ checkState: "checking" });
        const result = await checkSponsorRegexConfigUpdate(true);
        // 页面自身写入不触发本页的 storage.onChanged，应用新词条后主动刷新
        this.update();
        this.setState({ checkState: result.status });
    }

    private toggleFlag(flag: SponsorRegexFlag, enabled: boolean): void {
        const selected = new Set(this.state.flags.split(""));
        if (enabled) {
            selected.add(flag);
        } else {
            selected.delete(flag);
        }

        // 按固定顺序保存，避免 UI 与存储里的 flags 顺序漂移
        const flags = SPONSOR_REGEX_FLAGS.filter((candidate) => selected.has(candidate)).join("");

        this.setState({ flags, invalidRuleIds: getInvalidRuleIds(this.state.rules, flags) });
        Config.config.dynamicAndCommentSponsorRegexFlags = flags;
    }

    /** 改过的词条整条写进同步列表，生效时优先于默认词条 */
    private updateRule(ruleId: string, changes: Partial<DynamicSponsorRegexRule>): void {
        const userRules = [...(Config.config.dynamicAndCommentSponsorRegexUserRules ?? [])];
        const index = userRules.findIndex((rule) => rule.id === ruleId);
        // 首次修改内置词条时以默认词条为底，带上名称、版本与更新日期
        const base = index >= 0 ? userRules[index] : getBuiltinDefault(ruleId) ?? { id: ruleId, pattern: "", enabled: true };
        const updated: DynamicSponsorRegexRule = {
            ...base,
            ...changes,
            // 自定义词条没有在线配置可更新，记录最后一次修改日期
            ...(getBuiltinDefault(ruleId) ? {} : { updateAt: todaySponsorRuleDate() }),
        };

        if (index >= 0) userRules[index] = updated;
        else userRules.push(updated);

        Config.config.dynamicAndCommentSponsorRegexUserRules = userRules;
        this.refreshState();
    }

    /** 重置内置词条 = 丢掉用户版本，恢复默认（随包或在线）内容 */
    private resetRule(ruleId: string): void {
        Config.config.dynamicAndCommentSponsorRegexUserRules = (
            Config.config.dynamicAndCommentSponsorRegexUserRules ?? []
        ).filter((rule) => rule.id !== ruleId);
        this.refreshState();
    }

    private refreshState(): void {
        const rules = getEffectiveSponsorRegexRules();
        this.setState({ rules, invalidRuleIds: getInvalidRuleIds(rules, this.state.flags) });
    }

    private addCustomRule(): void {
        const id = `custom_${Date.now().toString(36)}`;
        const userRules = [
            ...(Config.config.dynamicAndCommentSponsorRegexUserRules ?? []),
            { id, name: "", pattern: "", enabled: true, updateAt: todaySponsorRuleDate() },
        ];
        Config.config.dynamicAndCommentSponsorRegexUserRules = userRules;
        this.refreshState();
    }

    private removeRule(ruleId: string): void {
        if (!confirm(chrome.i18n.getMessage("dynamicSponsorRegexRuleConfirmDelete"))) return;

        Config.config.dynamicAndCommentSponsorRegexUserRules = (
            Config.config.dynamicAndCommentSponsorRegexUserRules ?? []
        ).filter((rule) => rule.id !== ruleId);
        this.refreshState();
    }

    private resetAllRules(): void {
        if (!confirm(chrome.i18n.getMessage("dynamicSponsorRegexRuleConfirmReset"))) return;

        Config.config.dynamicAndCommentSponsorRegexUserRules = [];
        this.refreshState();
    }
}

export default DynamicSponsorRegexManagerComponent;
