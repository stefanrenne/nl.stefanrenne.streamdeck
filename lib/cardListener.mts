'use strict';

import { Store } from './storage.mjs';
import Homey from 'homey/lib/Homey.js';
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
    registerVariableAutocompleteListenerForCard(card: FlowCardTriggerDevice | FlowCardAction) {
        card.registerArgumentAutocompleteListener('variable', (query: string) => {
            return this.store
                .getVariables()
                .filter((variable) => {
                    return query.length == 0 || variable.name.toLowerCase().includes(query.toLowerCase());
                })
                .sort()
                .map((variable) => {
                    return this.createAutocompleteValue(variable.id, variable.name, variable.base64Sample);
                });
        });
    }
      
    registerImageAutocompleteListenerForCard(card: FlowCardTriggerDevice) {
        card.registerArgumentAutocompleteListener('image', (query: string) => {
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
        card.registerArgumentAutocompleteListener('dashboard', (query: string) => {

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
    
    registerVariableButtonRunListener(card: FlowCardTriggerDevice) {
        card.registerRunListener((args, state) => {
            return args.variable.id === state.variableId && args.action === state.action;
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