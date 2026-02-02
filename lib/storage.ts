'use strict';

import Homey from 'homey/lib/Homey';

export interface Image {
    readonly id: string;
    readonly name: string;
    readonly base64Image: string;
}

export interface Dashboard {
    readonly id: string;
    readonly name: string;
    readonly displayMode: number;
    readonly items: DashboardImage[];
}

export interface DashboardImage {
    readonly item: number;
    readonly name: string;
    readonly imageId: string;
    readonly imageBuffer: Buffer;
}

interface StoredImage {
    readonly id: string;
    readonly name: string;
}

interface StoredDashboard {
    readonly id: string;
    readonly name: string;
    readonly displayMode: number;
    readonly items: StoredDashboardItem[];
}

interface StoredDashboardItem {
    readonly type: string;
    readonly imageId: string;
    readonly item: number;
}

export class Store {

    private homey: Homey;

	constructor(homey: Homey) {
        this.homey = homey;
    }

    getImages(): Image[] {
        return this.homey.settings.get('images')?.map((image: StoredImage) => {
            return {
                id: image.id,
                name: image.name,
                base64Image: this.homey.settings.get(image.id)
            }
        }) ?? [];
    }

    createDashboardImage(imageId: string, item: number): DashboardImage | undefined {
        const image: Image | undefined = this.getImages().find((image: Image) => image.id === imageId);
        const name = image?.name;
        const base64ImageString: string | undefined = image?.base64Image.slice("data:image/png;base64,".length).toString();
        if (name === undefined || base64ImageString === undefined) {
            return undefined
        }
        return {item: item, name: name, imageId: imageId, imageBuffer: Buffer.from(base64ImageString, 'base64')};
    }

    getDashboard(id: string): Dashboard | undefined {
        return this.getDashboards().find((dashboard) => dashboard.id === id);
    }

    updateDashboard(id: string, size: number) {
        if (size !== 6 && size !== 15 && size !== 32) {
            return
        }
        const dashboards: StoredDashboard[] = this.homey.settings.get('dashboards') ?? [];
        const newDashboards = dashboards.map((dashboard) => {
            if (dashboard.id === id) {
                return { id: dashboard.id, name: dashboard.name, displayMode: size, items: dashboard.items }
            }
            return dashboard
        })
        this.homey.settings.set('dashboards', newDashboards);
    }

    getDashboards(): Dashboard[] {
        const dashboards: StoredDashboard[] = this.homey.settings.get('dashboards') ?? [];
        return dashboards.map((dashboard) => {
            const items = dashboard.items.map((row: StoredDashboardItem) => {
                if (row.type === 'image') {
                    return this.createDashboardImage(row.imageId, row.item);
                } else {
                    return undefined;
                }
            })
            .filter((item) => item !== undefined);
            return {id: dashboard.id, name: dashboard.name, displayMode: dashboard.displayMode, items: items}
        })
    }
}