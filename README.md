# Stream Deck for Homey

Control your Homey smart home directly from your Stream Deck — instantly, over your local network, without any cloud dependency.

**Download:**<br/>
Stable version: [Stream Deck | Homey](https://homey.app/a/nl.stefanrenne.streamdeck)<br/>
Test version: [Stream Deck | Homey](https://homey.app/a/nl.stefanrenne.streamdeck/test)

![streamdeck-homey](./md/streamdeck-homey.jpg)
![streamdeck-buttons](./md/streamdeck-buttons.jpg)

## Features

**Dashboards**<br/>
Organise your buttons into multiple named dashboards and switch between them from a Homey Flow. Build a "Morning" dashboard, a "Movie Night" layout, or any setup that fits your routine — then let Homey switch them automatically based on time, presence, or any other trigger.

**Custom Images**<br/>
Upload your own JPG or PNG images and assign them to buttons. Select multiple images at once during upload. Every button gets a clear, personalised icon.

**Dynamic Variables**<br/>
Create variable buttons that display two lines of live text — temperature, a device state, a countdown, or any value your flows produce. Set custom text and background colours per variable, and update the content in real time using Flow actions.

**Brightness Control**<br/>
Turn the Stream Deck on or off and dim the screen directly from Homey using the standard on/off and dim capabilities.

**Auto-Discovery**<br/>
The app automatically detects your Stream Deck Network Dock on the local network via mDNS, so setup takes seconds.

---

## Flow Cards

### Triggers (When)
| Card | Description | Tokens |
|------|-------------|--------|
| Turned on / off | Fires when the Stream Deck is turned on or off | — |
| Brightness changed | Fires when the brightness level changes | `dim` (0–1) |
| Dashboard has changed | Fires when the active dashboard changes | `dashboard` |
| Button action | Fires on any button event | `dashboard`, `imageName`, `textFirstLine`, `textSecondLine`, `payload`, `column`, `row` |
| Image button action | Fires when a button assigned to an image is triggered | `dashboard`, `payload`, `column`, `row` |
| Variable button action | Fires when a button assigned to a variable is triggered | `dashboard`, `textFirstLine`, `textSecondLine`, `payload`, `column`, `row` |
| Disabled button action | Fires when any button is triggered while the Stream Deck is turned off | `column`, `row` |

All button triggers support filtering by action type: **pressed** (down), **released** (up), **single pressed**, or **double pressed**.

### Conditions (And)
| Card | Description |
|------|-------------|
| Is turned on | Check whether the Stream Deck is currently on |
| Brightness is less than / greater than | Check the current brightness level |
| Dashboard is | Check whether a specific dashboard is currently active |

### Actions (Then)
| Card | Description |
|------|-------------|
| Turn on / off / toggle | Turn the Stream Deck on, off, or toggle it |
| Set brightness | Set the brightness to a specific percentage |
| Set dashboard | Switch to a specific dashboard |
| Update variable | Set both lines of text on a variable button |
| Update variable – first line | Update only the first line of a variable button |
| Update variable – second line | Update only the second line of a variable button |

---

## Configuration

Open the app settings in Homey to manage your dashboards, images, and variables. Use Stream Deck Studio to map each button to your Homey setup and assign custom payloads.

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

---

## Requirements

- Stream Deck Studio
- Stream Deck Network Dock, with one of the following devices:
  - Stream Deck Module 6
  - Stream Deck Module 15
  - Stream Deck Module 32
  - Stream Deck Mini
  - Stream Deck Classic
  - Stream Deck Scissor Keys
  - Stream Deck XL
  - Stream Deck neo (LCD buttons only)
  - Stream Deck + (LCD buttons only)

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## Powered by

- [node-elgato-stream-deck](https://github.com/Julusian/node-elgato-stream-deck)
- [jimp](https://github.com/jimp-dev/jimp)
- [homey-api](https://github.com/athombv/node-homey-api)
