# Stream Deck

Control Homey instantly from your Stream Deck — right over your LAN.<br/>Turn every LCD button into a powerful smart home trigger.

**Download:**<br/>
Stable version: [Stream Deck | Homey](https://homey.app/a/nl.stefanrenne.streamdeck)<br/>
Test version: [Stream Deck | Homey](https://homey.app/a/nl.stefanrenne.streamdeck)

![streamdeck-homey](./md/streamdeck-homey.jpg)
![streamdeck-buttons](./md/streamdeck-buttons.jpg)

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
![flow-button](./md/flow-button.png)

Navigate between dashboards
![flow-navigate](./md/flow-navigate.png)

Toggle your streamdeck
![flow-onoff](./md/flow-onoff.png)

## Configuration:
In the app's settings screen you can upload images and create dashboards, you can even set a payload that needs to be send on button press.

List and manage dashboards:
![list-dashboard](./md/list-dashboard.png)

Create / Edit dashboard:
![create-dashboard](./md/create-dashboard.png)

Update dashboard item:
![select-item](./md/select-item.png)

List and manage images:
![list-images](./md/list-images.png)

Edit image:
![edit-image](./md/edit-image.png)

## Powered by
This App would not have been possible without:

- [node-elgato-stream-deck](https://github.com/Julusian/node-elgato-stream-deck)
- [jimp](https://github.com/jimp-dev/jimp)
- [path](https://github.com/jinder/path)