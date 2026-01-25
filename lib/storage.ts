'use strict';

import Homey from 'homey/lib/Homey';

export interface Button {
    readonly id: string;
    readonly name: string;
}

export class Store {

    private homey: Homey;

	constructor(homey: Homey) {
        this.homey = homey;
    }

    getButtons(): Button[] {
        return this.homey.settings.get('buttons') ?? [];
    }
}