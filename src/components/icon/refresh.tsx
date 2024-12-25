import Icon from "@ant-design/icons";
import * as React from "react";

interface RefreshProps {
    color?: string;
    rotate?: number;
    spin?: boolean;
    style?: React.CSSProperties;
}

const refreshSvg = function (color: string = "#FFFFFF") {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" height="24px" width="24px" fill={color}>
            <path d="M0 0h24v24H0V0z" fill="none" />
            <path d="M 18.952 4.854 C 17.144 3.045 14.659 1.922 11.903 1.922 C 6.388 1.922 1.933 6.389 1.933 11.904 C 1.933 17.419 6.388 21.886 11.903 21.886 C 16.557 21.886 20.438 18.704 21.548 14.399 L 18.952 14.399 C 17.93 17.307 15.159 19.391 11.903 19.391 C 7.772 19.391 4.416 16.034 4.416 11.904 C 4.416 7.774 7.772 4.417 11.903 4.417 C 13.975 4.417 15.82 5.279 17.168 6.639 L 13.15 10.657 L 21.885 10.657 L 21.885 1.922 L 18.952 4.854 Z"></path>
        </svg>
    );
};

export const RefreshIcon = function ({ color, rotate, spin = false, style }: RefreshProps) {
    return <Icon component={() => refreshSvg(color)} rotate={rotate} spin={spin} style={style} />;
};
