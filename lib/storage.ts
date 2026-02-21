'use strict';

import Homey from 'homey/lib/Homey';

export interface Image {
    readonly id: string;
    readonly name: string;
    readonly base64Image: string;
    readonly imageBuffer: Buffer
}

export interface Text {
    readonly id: string;
    readonly name: string;
    readonly dashboard: string;
}

export interface Dashboard {
    readonly id: string;
    readonly name: string;
    readonly displayMode: number;
    readonly items: { [item: number] : DashboardItem; };
}

export type DashboardItem = DashboardEmptyItem | DashboardImageItem | DashboardTextItem;

export interface DashboardEmptyItem {
    readonly kind: 'empty';
    readonly payload: string;
}

export interface DashboardImageItem {
    readonly kind: 'image';
    readonly name: string;
    readonly payload: string;
    readonly imageId: string;
    readonly imageBuffer: Buffer;
}

export interface DashboardTextItem {
    readonly kind: 'text';
    readonly firstLine: string;
    readonly secondLine: string | undefined;
    readonly payload: string;
    readonly textId: string;
}

export interface ImageMetadata {
    id: string;
    name: string;
}

export interface DashboardMetadata {
    id: string;
    name: string;
}

interface StoredDashboard {
    displayMode: number;
    items: StoredDashboardItem[];
}

interface StoredDashboardItem {
    type: string;
    item: number;
    imageId: string | undefined;
    textId: string | undefined;
    textFirstLine: string | undefined;
    textSecondLine: string | undefined;
    payload: string;
}

export class Store {

    private homey: Homey;
    private cachedImagesMetadata: ImageMetadata[]
    private cachedImages: { [id: string] : Image; };
    private cachedDashboardMetadata: DashboardMetadata[];
    private cachedDashboards: { [id: string] : Dashboard; };

	constructor(homey: Homey) {
        this.homey = homey;
        this.cachedDashboardMetadata = [];
        this.cachedDashboards = {};
        this.cachedImagesMetadata = [];
        this.cachedImages = {};
    }

    updateDashboard(id: string, size: number) {
        if (size !== 6 && size !== 15 && size !== 32) {
            return
        }

        //update cache
        const cache = this.cachedDashboards[id];
        if (cache !== undefined) {
            this.cachedDashboards[id] = { id: cache.id, name: cache.name,  displayMode: size, items: cache.items };
        }

        //write cache back to store
        var data: StoredDashboard | undefined = this.homey.settings.get('dashboard-' + id);
        if (data !== undefined) {
            data.displayMode = size;
            this.homey.settings.set('dashboard-' + id, data);
        }
    }

    // cache dashboards
    invalidateDashboardMetadata() {
        this.cachedDashboardMetadata = this.homey.settings.get('dashboards') ?? [];
    }

    invalidateDashboard(id: string) {
        this.invalidateDashboardMetadata()
        if (this.cachedDashboards[id] !== undefined) {
            delete this.cachedDashboards[id];
        }
    }

    getDashboard(id: string): Dashboard | undefined {
        const cache = this.cachedDashboards[id];
        if (cache !== undefined) {
            return cache;
        }
        if (this.cachedDashboardMetadata.length == 0) {
            this.invalidateDashboardMetadata();
        }
        const metadata = this.cachedDashboardMetadata.find((dashboard) => dashboard.id === id);
        const data: StoredDashboard | undefined = this.homey.settings.get('dashboard-' + id);
        if (metadata === undefined || data === undefined) {
            return undefined
        }

        const defaultItems: { [item: number] : DashboardItem; } = Object.fromEntries(Array.from({length: 32}, (_, i) => [i + 1, { kind: 'empty', payload: '' }]));
        const items: { [item: number] : DashboardItem; } = data.items.reduce((result, row) => {
            const payload = row.payload.replace(/\\x22/g, '"').replace(/\\x27/g, '\'');
            if (row.type === 'image' && row.imageId !== undefined) {
                const image = this.getImage(row.imageId)
                if (image !== undefined) {
                    result[row.item] = { kind: 'image', name: image.name, payload: payload, imageId: row.imageId, imageBuffer: image.imageBuffer };
                    return result;
                }
            }
            if (row.type === 'text' && row.textFirstLine !== undefined && row.textId !== undefined) {
                result[row.item] = { kind: 'text', payload: payload, firstLine: row.textFirstLine, secondLine: row.textSecondLine, textId: row.textId };
                return result;
            }

            result[row.item] = { kind: 'empty', payload: payload };
            return result;
        }, defaultItems);

        const dashboard: Dashboard = { id: metadata.id, name: metadata.name, displayMode: data.displayMode, items: items };
        this.cachedDashboards[id] = dashboard;
        return dashboard;

    }

    getDashboardMetadata(): DashboardMetadata[] {
        if (this.cachedDashboardMetadata.length == 0) {
            this.invalidateDashboardMetadata();
        }
        return this.cachedDashboardMetadata
    }

    // cache images
    invalidateImagedMetadata() {
        this.cachedImagesMetadata = this.homey.settings.get('images') ?? [];
    }

    invalidateImage(id: string) {
        this.invalidateImagedMetadata()
        if (this.cachedImages[id] !== undefined) {
            delete this.cachedImages[id];
        }
    }

    getImage(id: string): Image | undefined {
        const cache = this.cachedImages[id];
        if (cache !== undefined) {
            return cache;
        }
        if (this.cachedImagesMetadata.length == 0) {
            this.invalidateImagedMetadata();
        }
        const metadata = this.cachedImagesMetadata.find((image) => image.id === id);
        const base64Image: string | undefined = this.homey.settings.get('image-' + id);
        const imageBuffer = (base64Image === undefined) ? undefined : Buffer.from(base64Image.replace(/^data:image\/[a-z]+;base64,/gi, ''), 'base64');

        if (metadata === undefined || base64Image === undefined || imageBuffer === undefined) {
            return undefined
        }
        const image: Image = { id: metadata.id, name: metadata.name, base64Image: base64Image, imageBuffer: imageBuffer }
        this.cachedImages[id] = image;
        return image;
    }

    getImages(): Image[] {
        return this.getImagesMetadata()
            .map((metadata) => {
                return this.getImage(metadata.id)
            })
            .filter((item) => item !== undefined);
    }

    getTexts(): Text[] {
        return this.getDashboardMetadata()
            .map((metadata) => {
                return this.getDashboard(metadata.id)
            })
            .filter((item) => item !== undefined)
            .map((dashboard) => {
                return Object.values(dashboard.items)
                .filter((item) => item.kind === 'text')
                .map((item) => { return { id: item.textId, name: item.firstLine, dashboard: dashboard.name } }) 
            })
            .flatMap((item) => item)
    }

    getImagesMetadata(): ImageMetadata[] {
        if (this.cachedImagesMetadata.length == 0) {
            this.invalidateImagedMetadata();
        }
        return this.cachedImagesMetadata;
    }

    // dead files
    cleanSettings() {
        const dashboardMetadata: DashboardMetadata[] = this.homey.settings.get('dashboards') ?? [];
        const imageMetadata: ImageMetadata[] = this.homey.settings.get('images') ?? [];

        const dashboardFiles = dashboardMetadata.map((metadata) => 'dashboard-' + metadata.id);
        const imageFiles = imageMetadata.map((metadata) => 'image-' + metadata.id);
        const allowedFiles = ['dashboards', 'images'].concat(dashboardFiles).concat(imageFiles);
        const toRemove = this.homey.settings.getKeys().filter((item) => !allowedFiles.includes(item));

        if (toRemove.length > 0) {
            this.homey.log("== remove ==");
            this.homey.log(toRemove);
            toRemove.forEach((item) => {
                this.homey.settings.unset(item);
            });
        }
    }
}