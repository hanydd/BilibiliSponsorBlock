import * as React from "react";

import Config from "../../config";
import * as CompileConfig from "../../../config.json";
import { Category, CategorySkipOption, DynamicSponsorOption } from "../../types";

import { getCategorySuffix } from "../../utils/categoryUtils";
import { ToggleOptionComponent, NumberOptionComponent } from "./ToggleOptionComponent";

import { SketchPicker } from "react-color";

export interface CategorySkipOptionsProps {
    category: Category;
    defaultColor?: string;
    defaultPreviewColor?: string;
    children?: React.ReactNode;
}

export interface CategorySkipOptionsState {
    color: string;
    previewColor?: string;
    showColorPicker?: boolean,
    showPreviewColorPicker?: boolean,
}

export interface ToggleOption {
    configKey: string;
    label: string;
    min?: number;
    max?: number;
    step?: number;
    type?: "toggle" | "number";
    description?: string;
}

class CategorySkipOptionsComponent extends React.Component<CategorySkipOptionsProps, CategorySkipOptionsState> {
    setBarColorTimeout: NodeJS.Timeout;

    constructor(props: CategorySkipOptionsProps) {
        super(props);

        // Setup state
        this.state = {
            color: props.defaultColor || Config.config.barTypes[this.props.category]?.color,
            previewColor: props.defaultPreviewColor || Config.config.barTypes["preview-" + this.props.category]?.color,
            showColorPicker: false,
            showPreviewColorPicker: false,
        };
    }

    render(): React.ReactElement {
        let defaultOption = "disable";
        // Set the default opton properly
        for (const categorySelection of Config.config.categorySelections) {
            if (categorySelection.name === this.props.category) {
                switch (categorySelection.option) {
                    case CategorySkipOption.ShowOverlay:
                        defaultOption = "showOverlay";
                        break;
                    case CategorySkipOption.ManualSkip:
                        defaultOption = "manualSkip";
                        break;
                    case CategorySkipOption.AutoSkip:
                        defaultOption = "autoSkip";
                        break;
                }

                break;
            }
        }

        return (
            <>
                <tr id={this.props.category + "OptionsRow"} className={`categoryTableElement`}>
                    <td id={this.props.category + "OptionName"} className="categoryTableLabel">
                        {chrome.i18n.getMessage("category_" + this.props.category)}
                    </td>

                    <td id={this.props.category + "SkipOption"} className="skipOption">
                        <select
                            className="optionsSelector"
                            defaultValue={defaultOption}
                            onChange={this.skipOptionSelected.bind(this)}
                        >
                            {this.getCategorySkipOptions()}
                        </select>
                    </td>

                    <td id={this.props.category + "ColorOption"} className="colorOption">
                        <div
                            style={{
                                width: "50px",
                                height: "21px",
                                backgroundColor: this.state.color,
                                border: "1px solid #ccc",
                                cursor: "pointer",
                            }}
                            onClick={() =>
                                this.setState({ showColorPicker: !this.state.showColorPicker })
                            }
                        />

                        {this.state.showColorPicker && (
                            <div style={{ position: "absolute", zIndex: 2 }}>
                                <div
                                    style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0 }}
                                    onClick={() => this.setState({ showColorPicker: false })}
                                />
                                <SketchPicker
                                    color={this.state.color}
                                    onChange={(color) => this.setColorState(color, false)}
                        />
                            </div>
                        )}
                    </td>

                    {!["exclusive_access"].includes(this.props.category) && (
                        <td id={this.props.category + "PreviewColorOption"} className="previewColorOption">
                            <div
                                style={{
                                    width: "50px",
                                    height: "21px",
                                    backgroundColor: this.state.previewColor,
                                    border: "1px solid #ccc",
                                    cursor: "pointer",
                                }}
                                onClick={() =>
                                    this.setState({
                                        showPreviewColorPicker: !this.state.showPreviewColorPicker,
                                    })
                                }
                            />

                            {this.state.showPreviewColorPicker && (
                                <div style={{ position: "absolute", zIndex: 2 }}>
                                    <div
                                        style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0 }}
                                        onClick={() =>
                                            this.setState({ showPreviewColorPicker: false })
                                        }
                                    />
                                    <SketchPicker
                                        color={this.state.previewColor}
                                        onChange={(color) => this.setColorState(color, true)}
                            />
                                </div>
                            )}
                        </td>
                    )}
                </tr>

                <tr
                    id={this.props.category + "DescriptionRow"}
                    className={`small-description categoryTableDescription`}
                >
                    <td colSpan={2}>
                        {chrome.i18n.getMessage("category_" + this.props.category + "_description")}{" "}
                        <a href={CompileConfig.wikiLinks[this.props.category]} target="_blank" rel="noreferrer">
                            {`${chrome.i18n.getMessage("LearnMore")}`}
                        </a>
                    </td>
                </tr>

                {this.getExtraOptionComponents(this.props.category)}
            </>
        );
    }

    skipOptionSelected(event: React.ChangeEvent<HTMLSelectElement>): void {
        let option: CategorySkipOption;

        switch (event.target.value) {
            case "disable":
                Config.config.categorySelections = Config.config.categorySelections.filter(
                    (categorySelection) => categorySelection.name !== this.props.category
                );
                return;
            case "showOverlay":
                option = CategorySkipOption.ShowOverlay;

                break;
            case "manualSkip":
                option = CategorySkipOption.ManualSkip;

                break;
            case "autoSkip":
                option = CategorySkipOption.AutoSkip;

                if (this.props.category === "filler" && !Config.config.isVip) {
                    if (!confirm(chrome.i18n.getMessage("FillerWarning"))) {
                        event.target.value = "disable";
                    }
                }

                break;
        }

        const existingSelection = Config.config.categorySelections.find(
            (selection) => selection.name === this.props.category
        );
        if (existingSelection) {
            existingSelection.option = option;
        } else {
            Config.config.categorySelections.push({
                name: this.props.category,
                option: option,
            });
        }

        Config.forceSyncUpdate("categorySelections");
    }

    getCategorySkipOptions(): JSX.Element[] {
        const elements: JSX.Element[] = [];

        let optionNames = ["disable", "showOverlay", "manualSkip", "autoSkip"];
        if (this.props.category === "exclusive_access") optionNames = ["disable", "showOverlay"];

        for (const optionName of optionNames) {
            elements.push(
                <option key={optionName} value={optionName}>
                    {chrome.i18n.getMessage(
                        optionName !== "disable" ? optionName + getCategorySuffix(this.props.category) : optionName
                    )}
                </option>
            );
        }

        return elements;
    }

    setColorState(
        input: React.FormEvent<HTMLInputElement> | { hex: string; rgb: { a: number } },
        preview: boolean
    ): void {
        clearTimeout(this.setBarColorTimeout);

        let colorValue: string;

        if ("currentTarget" in input) {
            // <input type="color">
            colorValue = input.currentTarget.value;
        } else {
            // SketchPicker（react-color）
            const rgba = input.rgb;
            const alphaHex = Math.round(rgba.a * 255).toString(16).padStart(2, "0");
            colorValue = input.hex + alphaHex;
        }

        if (preview) {
            this.setState({ previewColor: colorValue });
            Config.config.barTypes["preview-" + this.props.category].color = colorValue;
        } else {
            this.setState({ color: colorValue });
            Config.config.barTypes[this.props.category].color = colorValue;
        }

        this.setBarColorTimeout = setTimeout(() => {
            Config.config.barTypes = Config.config.barTypes;
        }, 50);
    }

    getExtraOptionComponents(category: string): JSX.Element[] {
        const result = [];
        for (const option of this.getExtraOptions(category)) {
            result.push(
                <tr key={option.configKey}>
                    <td id={`${category}_${option.configKey}`} className="categoryExtraOptions">
                        {option.type === "number" ? (
                            <NumberOptionComponent
                                configKey={option.configKey}
                                label={option.label}
                                style={{ width: "inherit" }}
                                min={option.min}
                                max={option.max}
                                step={option.step}
                                description={option.description}
                            />
                        ) : (
                        <ToggleOptionComponent
                            configKey={option.configKey}
                            label={option.label}
                            style={{ width: "inherit" }}
                                description={option.description}
                        />
                        )}
                    </td>
                </tr>
            );
        }

        return result;
    }

    getExtraOptions(category: string): ToggleOption[] {
        switch (category) {
            case "music_offtopic":
                return [
                    {
                        type: "toggle",
                        configKey: "autoSkipOnMusicVideos",
                        label: chrome.i18n.getMessage("autoSkipOnMusicVideos"),
                    },
                ];
            default:
                return [];
        }
    }
}

class DynamicSponsorHideOptionsComponent extends React.Component<CategorySkipOptionsProps, CategorySkipOptionsState> {
    setBarColorTimeout: NodeJS.Timeout;

    constructor(props: CategorySkipOptionsProps) {
        super(props);

        // Setup state
        this.state = {
            color: props.defaultColor || Config.config.dynamicSponsorTypes[this.props.category]?.color
        };
    }

    render(): React.ReactElement {
        let defaultOption = "disable";
        // Set the default opton properly
        for (const categorySelection of Config.config.dynamicSponsorSelections) {
            if (categorySelection.name === this.props.category) {
                switch (categorySelection.option) {
                    case DynamicSponsorOption.ShowOverlay:
                        defaultOption = "showOverlay_DynamicSponsor";
                        break;
                    case DynamicSponsorOption.Hide:
                        defaultOption = "Hide_DynamicSponsor";
                        break;
                }

                break;
            }
        }

        return (
            <>
                <tr id={this.props.category + "OptionsRow"} className={`categoryTableElement`}>
                    <td id={this.props.category + "OptionName"} className="categoryTableLabel">
                        {chrome.i18n.getMessage("category_" + this.props.category)}
                    </td>

                    <td id={this.props.category + "SkipOption"} className="skipOption">
                        <select
                            className="optionsSelector"
                            defaultValue={defaultOption}
                            onChange={this.skipOptionSelected.bind(this)}
                        >
                            {this.getCategorySkipOptions()}
                        </select>
                    </td>

                    <td id={this.props.category + "ColorOption"} className="colorOption">
                        <input
                            className="categoryColorTextBox option-text-box"
                            type="color"
                            onChange={(event) => this.setColorState(event)}
                            value={this.state.color}
                        />
                    </td>
                </tr>

                <tr
                    id={this.props.category + "DescriptionRow"}
                    className={`small-description categoryTableDescription`}
                >
                    <td colSpan={2}>
                        {chrome.i18n.getMessage("category_" + this.props.category + "_description")}
                    </td>
                </tr>
            </>
        );
    }

    skipOptionSelected(event: React.ChangeEvent<HTMLSelectElement>): void {
        let option: DynamicSponsorOption;

        switch (event.target.value) {
            case "disable":
                Config.config.dynamicSponsorSelections = Config.config.dynamicSponsorSelections.filter(
                    (dynamicSponsorSelections) => dynamicSponsorSelections.name !== this.props.category
                );
                return;
            case "showOverlay_DynamicSponsor":
                option = DynamicSponsorOption.ShowOverlay;

                break;
            case "Hide_DynamicSponsor":
                option = DynamicSponsorOption.Hide;

                break;
        }

        const existingSelection = Config.config.dynamicSponsorSelections.find(
            (selection) => selection.name === this.props.category
        );
        if (existingSelection) {
            existingSelection.option = option;
        } else {
            Config.config.dynamicSponsorSelections.push({
                name: this.props.category,
                option: option,
            });
        }

        Config.forceSyncUpdate("dynamicSponsorSelections");
    }

    getCategorySkipOptions(): JSX.Element[] {
        const elements: JSX.Element[] = [];

        const optionNames = ["disable", "showOverlay_DynamicSponsor", "Hide_DynamicSponsor"];

        for (const optionName of optionNames) {
            elements.push(
                <option key={optionName} value={optionName}>
                    {chrome.i18n.getMessage(optionName)}
                </option>
            );
        }

        return elements;
    }

    setColorState(event: React.FormEvent<HTMLInputElement>): void {
        clearTimeout(this.setBarColorTimeout);

        this.setState({
            color: event.currentTarget.value,
        });

        Config.config.dynamicSponsorTypes[this.props.category].color = event.currentTarget.value;


        // Make listener get called
        this.setBarColorTimeout = setTimeout(() => {
            Config.config.dynamicSponsorTypes = Config.config.dynamicSponsorTypes;
        }, 50);
    }
}

export {CategorySkipOptionsComponent, DynamicSponsorHideOptionsComponent}
