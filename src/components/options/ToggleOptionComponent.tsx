import * as React from "react";

import Config from "../../config";

export interface ToggleOptionProps {
    configKey: string;
    label: string;
    disabled?: boolean;
    style?: React.CSSProperties;
    description?: string;
}

export interface ToggleOptionState {
    enabled: boolean;
}

class ToggleOptionComponent extends React.Component<ToggleOptionProps, ToggleOptionState> {
    constructor(props: ToggleOptionProps) {
        super(props);

        // Setup state
        this.state = {
            enabled: Config.config[props.configKey],
        };
    }

    render(): React.ReactElement {
        return (
            <div className={`sb-toggle-option ${this.props.disabled ? "disabled" : ""}`}>
                <div className="switch-container" style={this.props.style}>
                    <label className="switch">
                        <input
                            id={this.props.configKey}
                            type="checkbox"
                            checked={this.state.enabled}
                            disabled={this.props.disabled}
                            onChange={(e) => this.clicked(e)}
                        />
                        <span className="slider round"></span>
                    </label>
                    <label className="switch-label" htmlFor={this.props.configKey}>
                        {this.props.label}
                    </label>
                </div>
                {this.props.description && (
                    <div className="small-description">{this.props.description}</div>
                )}
            </div>
        );
    }

    clicked(event: React.ChangeEvent<HTMLInputElement>): void {
        Config.config[this.props.configKey] = event.target.checked;

        this.setState({
            enabled: event.target.checked,
        });
    }
}

export interface NumberOptionProps {
    configKey: string;
    label: string;
    disabled?: boolean;
    style?: React.CSSProperties;
    min?: number;
    max?: number;
    step?: number;
    description?: string;
}

export interface NumberOptionState {
    value: number;
}

class NumberOptionComponent extends React.Component<NumberOptionProps, NumberOptionState> {
    constructor(props: NumberOptionProps) {
        super(props);

        this.state = {
            value: Number(Config.config[props.configKey]) || 0,
        };
    }

    render(): React.ReactElement {
        return (
            <div className={`sb-number-option ${this.props.disabled ? "disabled" : ""}`}>
                <div className="number-change" style={this.props.style}>
                    <label className="number-container">
                        <span className="optionLabel">{this.props.label}</span>
                        <input
                            id={this.props.configKey}
                            type="number"
                            value={this.state.value}
                            disabled={this.props.disabled}
                            min={this.props.min}
                            max={this.props.max}
                            step={1}
                            onChange={e => this.handleChange(e)}
                        />
                    </label>
                    {this.props.description && (
                        <div className="small-description">{this.props.description}</div>
                    )}
                </div>
            </div>
        );
    }

    handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
        const value = Number(event.target.value);
        Config.config[this.props.configKey] = value;
        this.setState({ value });
    }
}

export { ToggleOptionComponent, NumberOptionComponent };
