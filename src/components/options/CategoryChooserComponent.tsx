import * as React from "react";

import * as CompileConfig from "../../../config.json";
import { Category } from "../../types";
import {CategorySkipOptionsComponent, DynamicSponsorHideOptionsComponent} from "./CategorySkipOptionsComponent";

export interface CategoryChooserProps {}

export interface CategoryChooserState {}

class CategoryChooserComponent extends React.Component<CategoryChooserProps, CategoryChooserState> {
    constructor(props: CategoryChooserProps) {
        super(props);

        // Setup state
        this.state = {};
    }

    render(): React.ReactElement {
        return (
            <table id="categoryChooserTable" className="categoryChooserTable">
                <tbody>
                    {/* Headers */}
                    <tr id={"CategoryOptionsRow"} className="categoryTableElement categoryTableHeader">
                        <th id={"CategoryOptionName"}>{chrome.i18n.getMessage("category")}</th>

                        <th id={"CategorySkipOption"} className="skipOption">
                            {chrome.i18n.getMessage("skipOption")}
                        </th>

                        <th id={"CategoryColorOption"} className="colorOption">
                            {chrome.i18n.getMessage("seekBarColor")}
                        </th>

                        <th id={"CategoryPreviewColorOption"} className="previewColorOption">
                            {chrome.i18n.getMessage("previewColor")}
                        </th>
                    </tr>

                    {this.getCategorySkipOptions()}
                </tbody>
            </table>
        );
    }

    getCategorySkipOptions(): JSX.Element[] {
        const elements: JSX.Element[] = [];

        for (const category of CompileConfig.categoryList) {
            elements.push(
                <CategorySkipOptionsComponent
                    category={category as Category}
                    key={category}
                ></CategorySkipOptionsComponent>
            );
        }

        return elements;
    }
}

class DynamicSponsorChooserComponent extends React.Component<CategoryChooserProps, CategoryChooserState> {
    constructor(props: CategoryChooserProps) {
        super(props);

        // Setup state
        this.state = {};
    }

    render(): React.ReactElement {
        return (
            <table id="categoryChooserTable" className="categoryChooserTable">
                <tbody>
                    <tr id={"CategoryOptionsRow"} className="categoryTableElement categoryTableHeader">
                        <th id={"CategoryOptionName"}>
                            {chrome.i18n.getMessage("category")}
                        </th>

                        <th id={"CategoryHideOption"} className="HideOption">
                            {chrome.i18n.getMessage("skipOptionDynamicSponsor")}
                        </th>
                        
                        <th id={"CategoryColorOption"} className="ColorOption">
                            {chrome.i18n.getMessage("colorDynamicSponsor")}
                        </th>
                    </tr>


                    {this.getCategorySkipOptions()}
                </tbody>
            </table>
        );
    }

    getCategorySkipOptions(): JSX.Element[] {
        const elements: JSX.Element[] = [];
        const list = ["dynamicSponsor_sponsor", "dynamicSponsor_forward_sponsor", "dynamicSponsor_suspicion_sponsor"]

        for (const category of list) {
            elements.push(
                <DynamicSponsorHideOptionsComponent
                    category={category as Category}
                    key={category}
                ></DynamicSponsorHideOptionsComponent>
            );
        }

        return elements;
    }
}

export {CategoryChooserComponent, DynamicSponsorChooserComponent}
