import * as React from "react";

export interface ButtonListener {
    name: string;
    listener: (e?: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
}