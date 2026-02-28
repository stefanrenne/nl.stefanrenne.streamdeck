'use strict';

import Homey from 'homey/lib/Homey';

export interface Image {
    readonly id: string;
    readonly name: string;
    readonly base64Image: string;
    readonly imageBuffer: Buffer
}

export interface Variable {
    readonly id: string;
    readonly name: string;
    readonly firstLine: string;
    readonly secondLine: string | undefined;
    readonly base64Sample: string | undefined;
}

export interface Dashboard {
    readonly id: string;
    readonly name: string;
    readonly displayMode: number;
    readonly items: { [item: number] : DashboardItem; };
}

export type DashboardItem = DashboardEmptyItem | DashboardImageItem | DashboardVariableItem;

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

export interface DashboardVariableItem {
    readonly kind: 'variable';
    readonly name: string;
    readonly payload: string;
    readonly variableId: string;
    readonly firstLine: string;
    readonly secondLine: string | undefined;
}

export interface Metadata {
    id: string;
    name: string;
}

interface StoredVariable {
    firstLine: string;
    secondLine: string;
    sample: string;
}

interface StoredDashboard {
    displayMode: number;
    items: StoredDashboardItem[];
}

interface StoredDashboardItem {
    type: string;
    item: number;
    imageId: string | undefined;
    variableId: string | undefined;
    payload: string;
}

export class Store {

    private homey: Homey;
    private cachedDashboardMetadata: Metadata[];
    private cachedDashboards: { [id: string] : Dashboard; };
    private cachedVariablesMetadata: Metadata[]
    private cachedVariables: { [id: string] : Variable; };
    private cachedImagesMetadata: Metadata[]
    private cachedImages: { [id: string] : Image; };

	constructor(homey: Homey) {
        this.homey = homey;
        this.cachedDashboardMetadata = [];
        this.cachedDashboards = {};
        this.cachedVariablesMetadata = [];
        this.cachedVariables = {};
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
                const image = this.getImage(row.imageId);
                if (image !== undefined) {
                    result[row.item] = { kind: 'image', name: image.name, payload: payload, imageId: row.imageId, imageBuffer: image.imageBuffer };
                    return result;
                }
            }

            if (row.type === 'variable' && row.variableId !== undefined) {
                const variable = this.getVariable(row.variableId);
                if (variable !== undefined) {
                    result[row.item] = { kind: 'variable', name: variable.name, payload: payload, variableId: variable.id, firstLine: variable.firstLine, secondLine: variable.secondLine };
                    return result;
                }
            }

            result[row.item] = { kind: 'empty', payload: payload };
            return result;
        }, defaultItems);

        const dashboard: Dashboard = { id: metadata.id, name: metadata.name, displayMode: data.displayMode, items: items };
        this.cachedDashboards[id] = dashboard;
        return dashboard;

    }

    getDashboardMetadata(): Metadata[] {
        if (this.cachedDashboardMetadata.length == 0) {
            this.invalidateDashboardMetadata();
        }
        return this.cachedDashboardMetadata
    }

    // cache variables
    invalidateVariablesMetadata() {
        this.cachedVariablesMetadata = this.homey.settings.get('variables') ?? [];
    }

    invalidateVariable(id: string) {
        this.invalidateVariablesMetadata()
        if (this.cachedVariables[id] !== undefined) {
            delete this.cachedVariables[id];
        }
    }

    getVariablesMetadata(): Metadata[] {
        if (this.cachedVariablesMetadata.length == 0) {
            this.invalidateVariablesMetadata();
        }
        return this.cachedVariablesMetadata;
    }

    setVariable(id: string, firstLine: string, secondLine: string | undefined, base64Sample: string) {
        if (this.cachedImages[id] !== undefined) {
            delete this.cachedImages[id];
        }
        const variable: StoredVariable = { firstLine: firstLine, secondLine: secondLine ?? '', sample: base64Sample };
        this.homey.settings.set('variable-' + id, variable);
    }

    getVariable(id: string): Variable | undefined {
        const cache = this.cachedVariables[id];
        if (cache !== undefined) {
            return cache;
        }
        if (this.cachedVariablesMetadata.length == 0) {
            this.invalidateVariablesMetadata();
        }
        const metadata = this.cachedVariablesMetadata.find((variable) => variable.id === id);
        const variable: StoredVariable | undefined = this.homey.settings.get('variable-' + id);
        if (metadata === undefined) {
            return undefined
        }

        const firstLine = variable?.firstLine ?? ''
        const secondLine = variable?.secondLine ?? ''

        const image: Variable = { id: metadata.id, name: metadata.name, firstLine: firstLine, secondLine: (secondLine === '') ? undefined : secondLine, base64Sample: variable?.sample }
        this.cachedVariables[id] = image;
        return image;
    }

    getVariables(): Variable[] {
        return this.getVariablesMetadata()
            .map((metadata) => {
                return this.getVariable(metadata.id);
            })
            .filter((item) => item !== undefined);
    }

    // cache images
    invalidateImagesMetadata() {
        this.cachedImagesMetadata = this.homey.settings.get('images') ?? [];
    }

    invalidateImage(id: string) {
        this.invalidateImagesMetadata();
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
            this.invalidateImagesMetadata();
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

    getImagesMetadata(): Metadata[] {
        if (this.cachedImagesMetadata.length == 0) {
            this.invalidateImagesMetadata();
        }
        return this.cachedImagesMetadata;
    }

    // dead files
    cleanSettings() {
        const dashboardMetadata: Metadata[] = this.homey.settings.get('dashboards') ?? [];
        const imageMetadata: Metadata[] = this.homey.settings.get('images') ?? [];
        const variablesMetadata: Metadata[] = this.homey.settings.get('variables') ?? [];

        const dashboardFiles = dashboardMetadata.map((metadata) => 'dashboard-' + metadata.id);
        const imageFiles = imageMetadata.map((metadata) => 'image-' + metadata.id);
        const variableFiles = variablesMetadata.map((metadata) => 'variable-' + metadata.id);
        const allowedFiles = ['dashboards', 'images', 'variables'].concat(dashboardFiles).concat(imageFiles).concat(variableFiles);
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