'use strict';

import Homey from 'homey/lib/Homey';

export interface Button {
    readonly id: string;
    readonly name: string;
}

export interface Dashboard {
    readonly id: string;
    readonly name: string;
    readonly displayMode: number;
    readonly items: DashboardButton[];
}

export interface DashboardButton {
    readonly id: string;
    readonly item: number;
    readonly name: string;
    readonly imageBuffer: Buffer;
}

interface StoredDashboard {
    readonly id: string;
    readonly name: string;
    readonly displayMode: number;
    readonly items: StoredDashboardItem[];
}

interface StoredDashboardItem {
    readonly type: string;
    readonly buttonId: string;
    readonly item: number;
}

export class Store {

    private homey: Homey;

	constructor(homey: Homey) {
        this.homey = homey;
    }

    getButtons(): Button[] {
        return this.homey.settings.get('buttons') ?? [];
    }

    createDashboardButton(id: string, item: number): DashboardButton | undefined {
        const name: string | undefined = this.getButtons().find((button: Button) => button.id === id)?.name;
        const base64ImageString: string | undefined = this.homey.settings.get(id).slice("data:image/png;base64,".length).toString();
        if (name === undefined || base64ImageString === undefined) {
            return undefined
        }
        return {id: id, item: item, name: name, imageBuffer: Buffer.from(base64ImageString, 'base64')};
    }

    getDashboard(id: string): Dashboard | undefined {
        return this.getDashboards().find((dashboard) => dashboard.id === id);
    }

    getDashboards(): Dashboard[] {
        var dashboards = this.homey.settings.get('dashboards') ?? [];
        return dashboards.map((dashboard: StoredDashboard) => {
            const items = dashboard.items.map((row: StoredDashboardItem) => {
                if (row.type == "button") {
                    return this.createDashboardButton(row.buttonId, row.item);
                } else {
                    return undefined;
                }
            })
            .filter((item) => item !== undefined);
            return {id: dashboard.id, name: dashboard.name, displayMode: dashboard.displayMode, items: items}
        })
    }
}