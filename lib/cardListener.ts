'use strict';

import { Store } from './storage';
import Homey from 'homey/lib/Homey';
import { FlowCardAction, FlowCardTriggerDevice, FlowCardCondition } from 'homey';

export class CardListener {

    private homey: Homey;
    private store: Store
    emptyDashboard = this.createAutocompleteValue('0', 'Homey');

    constructor(homey: Homey, store: Store) {
        this.homey = homey;
        this.store = store
    }
    
    // Autocomplete Listeners
    registerTextAutocompleteListenerForCard(card: FlowCardTriggerDevice | FlowCardAction) {
        card.registerArgumentAutocompleteListener('text', (query: string, args: any) => {
            return this.store
                .getTexts()
                .filter((text) => {
                    return query.length == 0 || text.name.toLowerCase().includes(query.toLowerCase());
                })
                .sort()
                .map((text) => {
                    return {
                    textId: text.id,
                    dashboardId: text.dashboardId,
                    name: text.name,
                    description: this.homey.__('inDashboard', { dashboard: text.dashboard })
                    }
                });
        });
    }
      
    registerImageAutocompleteListenerForCard(card: FlowCardTriggerDevice) {
        card.registerArgumentAutocompleteListener('image', (query: string, args: any) => {
            return this.store
                .getImages()
                .filter((image) => {
                    return query.length == 0 || image.name.toLowerCase().includes(query.toLowerCase());
                })
                .sort()
                .map(button => {
                    return this.createAutocompleteValue(button.id, button.name, button.base64Image);
                });
        });
    }
  
    registerDashboardAutocompleteListenerForCard(card: FlowCardCondition | FlowCardAction) {
        card.registerArgumentAutocompleteListener('dashboard', (query: string, args: any) => {

            const selectableOptions = this.store.getDashboardMetadata().map(dashboard => {
                return this.createAutocompleteValue(dashboard.id, dashboard.name)
            }).sort();
            
            return [this.emptyDashboard]
                .concat(selectableOptions)
                .filter((option) => {
                    return query.length == 0 || option.name.toLowerCase().includes(query.toLowerCase());
                });
        });
    }
    
    // Run Listeners
    registerImageButtonRunListener(card: FlowCardTriggerDevice) {
        card.registerRunListener((args, state) => {
            return args.image.id === state.imageId && args.action === state.action;
        });
    }
    
    registerTextButtonRunListener(card: FlowCardTriggerDevice) {
        card.registerRunListener((args, state) => {
            return args.text.textId === state.textId && args.action === state.action;
        });
    }
    
    registerAnyButtonRunListener(card: FlowCardTriggerDevice) {
        card.registerRunListener((args, state) => {
            return args.action === state.action;
        });
    }
    
    private createAutocompleteValue(id: string, name: string, image: string | undefined = undefined) {
        return {
            id: id,
            name: name,
            description: '',
            image: image ?? ''
        }
    }
}