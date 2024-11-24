import Config from "../config";

export function showDonationLink(): boolean {
    return navigator.vendor !== "Apple Computer, Inc." && Config.config.showDonationLink;
}

export function getIconLink(icon: string): string {
    if (Config.config.showNewIcon) {
        return icon;
    }
    return "oldIcon/" + icon;
}
