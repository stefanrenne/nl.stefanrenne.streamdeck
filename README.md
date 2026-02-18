# Stream Deck

Control Homey instantly from your Stream Deck — right over your LAN.<br/>Turn every LCD button into a powerful smart home trigger.

**Download:**<br/>
Stable version: [Stream Deck | Homey](https://homey.app/a/nl.stefanrenne.streamdeck)<br/>
Test version: [Stream Deck | Homey](https://homey.app/a/nl.stefanrenne.streamdeck)

![streamdeck-homey](./assets/streamdeck-homey.jpg)
![streamdeck-buttons](./assets/streamdeck-buttons.jpg)

## Requirements:
- Stream Deck Studio
- Stream Deck Network Dock, with one of the following devices:
	- Stream Deck Module 6
	- Stream Deck Module 15
	- Stream Deck Module 32
	- Stream Deck Mini
	- Stream Deck Classic
	- Stream Deck Scissor Keys
	- Stream Deck XL
	- Stream Deck neo (only lcd buttons supported)
	- Stream Deck + (only lcd buttons supported)

## Flow:
Act on specific button presses or process a send payload
![flow-button](./assets/flow-button.png)

Navigate between dashboards
![flow-navigate](./assets/flow-navigate.png)

Toggle your streamdeck
![flow-onoff](./assets/flow-onoff.png)

## Configuration:
In the app's settings screen you can upload images and create dashboards, you can even set a payload that needs to be send on button press.

List and manage dashboards:
![list-dashboard](./assets/list-dashboard.png)

Create / Edit dashboard:
![create-dashboard](./assets/create-dashboard.png)

Update dashboard item:
![select-item](./assets/select-item.png)

List and manage images:
![list-images](./assets/list-images.png)

Edit image:
![edit-image](./assets/edit-image.png)

## Powered by
This App would not have been possible without:

- [node-elgato-stream-deck](https://github.com/Julusian/node-elgato-stream-deck)
- [jimp](https://github.com/jimp-dev/jimp)
- [path](https://github.com/jinder/path)