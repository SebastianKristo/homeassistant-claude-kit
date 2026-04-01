# System Overview

## Home Layout

Hytte med fire etasjer / nivåer:

- **Første Etasje (1):** Stue, Kjøkken, Inngang, Do, Vaskegang, Veranda
- **Andre Etasje (2):** Soverom, Bad, Trappegang, Pult, Cybele Soverom, Rune Kontor, Rune Soverom
- **Løfte (3):** Løfte
- **Ute (0):** Ute (utendørs / hage)
- **Garasje (-1):** Garasje

Areas konfigurert i HA: inngang, kjokken, stue, do, vaskegang, ute, veranda, bod,
pult, soverom, seng (slått sammen i dashboard), benk (slått sammen), bad, trappegang,
cybele_soverom, rune_kontor, rune_soverom, server_rack, lofte, garasje

## Integrations

| Integration | What it controls | Key entities |
|-------------|-----------------|--------------|
| Hue | Diverse lamper (stue, kjøkken, soverom m.fl.) | `light.*` via Hue-grupper og -soner |
| Plejd | Trappelys, markiser, bad speillampe, Rune soverom taklampe | `light.trappelys`, `cover.markise_*` |
| MQTT / Zigbee | Bevegelsessensorer, gulvvarme, panelovner | `binary_sensor.*_bevegelsesalarm`, `climate.*` |
| Mill | Panelovner (stue, kjøkken, cybele, trappegang) | `climate.*_panelovn`, `climate.stue_oljefyr` |
| Ebeco | Do gulvvarme | `climate.do_gulvvarme` |
| ESPHome | Presence-sensorer (stue, kjøkken) | `binary_sensor.everything_presence_*` |
| Matter | Aqara bevegelsessensor (trappegang), kjøkken rullegardin | `binary_sensor.aqara_motion_sensor_occupancy`, `cover.kjokken_rullegardin` |
| UnifiProtect | Kameraer, G4 Doorbell Pro | `camera.*`, `binary_sensor.g4_doorbell_pro_*` |
| Apple TV | Stue TV | `media_player.stue_tv` |
| Yamaha MusicCast | Stue receiver/forsterker | `media_player.rn602_stue` |
| Frontier Silicon | Kjøkken radio | `media_player.kjokken_radio` |
| Cast | Pult og soverom display, stue Sony TV | `media_player.pult_display`, `media_player.soverom_display`, `media_player.sonytv` |
| Yale / Dorlas | Smarthus dørlås | `lock.dorlas`, `binary_sensor.dorlas_wifi_door` |
| Verisure | Alarm | `alarm_control_panel.verisure_alarm` |
| Zaptec | El-billader | `binary_sensor.elbillader_*`, `sensor.elbillader_*` |
| Homey Energy Dongle | Strømmåler (AMS/HAN) | `sensor.homey_energy_dongle_effekt` |
| Tibber | Strømpriser | `sensor.toten_kolbulinna_239_*` |
| SwitchBot | Gardiner (stue), do curtain | `cover.curtain_50`, `cover.gardiner` |
| Tuya | Diverse (kjøkken matbord lys, taklist, m.fl.) | `light.kjokken_matbord`, `light.taklist` |
| ZHA | Dør- og vindunsensorer (cybele, rune soverom/kontor) | `binary_sensor.*_dor`, `binary_sensor.*_vindu` |
| Mobile App | Sebastian, Rune, Cybele telefoner | `person.*`, `device_tracker.*` |
| Unraid | Server (D-Day Darling) | `sensor.d_day_darling_*` |

## Climate System

- **Oppvarmingstype:** Elektrisk (panelovner + gulvvarme)
- **Panelovner (Mill):** Stue, kjøkken, cybele soverom, trappegang
- **Panelovn (MQTT/ESPHome):** Sebastian soverom (`climate.sebastian_panelovn`)
- **Gulvvarme:** Bad (`climate.bad_gulvvarme`), Do (`climate.do_gulvvarme`), Kjøkken (`climate.kjokken_gulvvarme`), Vaskegang (`climate.vaskegang_gulvvarme`)
- **Oljefyr (Mill):** Stue (`climate.stue_oljefyr`)
- **Temperatursensorer per rom:**
  - Inngang: `sensor.inngang_temp_og_fukt_temperatur`
  - Stue: `sensor.stue_temp_og_fukt_temperatur`
  - Pult: `sensor.meter_pro_temperature`
  - Soverom: `sensor.panelovn_temperatur_2`
  - Bad: `sensor.bad_bevegelsesensor_temperatur`
  - Ute: `sensor.vaervarsel_temperatur`

## Lighting

- **Protokoller:** Hue (Zigbee), Plejd, MQTT/Zigbee, Tuya (WiFi), ESPHome, Matter
- **Lyskontrollgrupper per rom:**
  - Stue: `light.stue_lys`
  - Kjøkken: `light.kjokken_lys`
  - Inngang: `light.inngang_lys`
  - Do: `light.do_lys`
  - Soverom: `light.soverom_lys`
  - Bad: `light.bad_lys`
  - Trappegang: `light.trappegang_lys`
  - Cybele Soverom: `light.cybele_soverom_lys`
  - Rune Soverom: `light.rune_soverom_lys`
  - Pult: `light.pult_lys`
  - Seng (under Soverom i dashboard): `light.nattlampe`
- **Bevegelsessensorer:**
  - Stue: `binary_sensor.everything_presence_lite_occupancy` (ESPHome EP Lite)
  - Kjøkken: `binary_sensor.everything_presence_one_occupancy` (ESPHome EP One)
  - Soverom: `binary_sensor.soverom_hjornesensor_bevegelsesalarm`
  - Bad: `binary_sensor.bad_bevegelsesensor_bevegelsesalarm`
  - Trappegang: `binary_sensor.aqara_motion_sensor_occupancy` (Matter)
  - Cybele Soverom: `binary_sensor.cybele_naervaersensor_bevegelsesalarm`
  - Rune Soverom: `binary_sensor.rune_naervaersensor_bevegelsesalarm`

## Energy / Solar

- **Solar:** Nei — ingen solcelleanlegg
- **Strømmåler:** Homey Energy Dongle (AMS/HAN) — `sensor.homey_energy_dongle_effekt`
- **Faser:** `sensor.homey_energy_dongle_effekt_fase_1/2/3`
- **Strømpris:** Tibber — `sensor.toten_kolbulinna_239_current_electricity_price`
- **El-billader:** Zaptec (`binary_sensor.elbillader_online`, m.fl.)
- **Vannbereder:** `sensor.vannbaren_varme_stromforbruk`
- **Fryseskap:** `sensor.fryseskap_effekt` / `switch.fryseskap`

## Security / Cameras

- **Alarm:** Verisure — `alarm_control_panel.verisure_alarm`
- **Kamera-integrasjon:** UnifiProtect
- **Kameraer:**
  - G4 Doorbell Pro (inngang/ringeklokke)
  - TP-Link Tapo C200 (innendørs)
  - Veranda G3 Bullet
  - Andre UnifiProtect-kameraer
- **Dørlås:** Dorlas/Yale WiFi — `lock.dorlas`
- **Varsler:** `notify.mobile_app_sebastian_iphone_17_pro`, `notify.mobile_app_sebastian_pixel_9_pro_fold`

## Media

- **Stue:** Apple TV (`media_player.stue_tv`), Sony TV via Cast (`media_player.sonytv`), Yamaha MusicCast (`media_player.rn602_stue`)
- **Kjøkken:** Frontier Silicon radio (`media_player.kjokken_radio`)
- **Soverom:** Google Cast display (`media_player.soverom_display`)
- **Pult:** Google Cast display (`media_player.pult_display`)
- **Sonos:** `media_player.sonos`
- **Squeezebox:** `media_player.squeezebox_boom`, `media_player.squeezebox_radio`

## People / Presence

- **Sporede personer:**
  - Sebastian: `person.sebastian_kristo_jemtland`
  - Rune: `person.rune_jemtland`
  - Cybele: `person.cybele_kristo`
- **Sporingsmetode:** HA Companion App (mobil)
- **Hjemme/borte:** `input_boolean.away_mode` synkronisert mot `alarm_control_panel.verisure_alarm` (armed_away)

## Key Helpers Registry

### Input Booleans
- `input_boolean.night_mode` — Nattmodus
- `input_boolean.movie_mode` — Filmmodus
- `input_boolean.work_mode` — Arbeidsmodus
- `input_boolean.away_mode` — Borte-modus

### Input Selects
<!-- Legg til hvis climate-modus m.m. konfigureres -->

### Input Numbers
- `input_number.timeout_motion_normal` — Bevegelseslys timeout (normal)
- `input_number.timeout_motion_normal_long` — Bevegelseslys timeout (lang)
- `input_number.timeout_motion_night` — Bevegelseslys timeout (natt)
- `input_number.timeout_motion_night_short` — Bevegelseslys timeout (natt, kort)
- `input_number.timeout_motion_movie` — Bevegelseslys timeout (film)
- `input_number.transition_on` — Overgangs­tid lys på
- `input_number.transition_off` — Overgangs­tid lys av

### Input Datetimes
<!-- Legg til oppvåkningstider m.m. etter hvert -->

## Automation Design Decisions

- **Seng og Benk** er separate HA-areas, men slått sammen til «Soverom» i dashboardet for enkelhetens skyld.
- **Rune Kontor** har ingen lysgruppe — kun stikkontakt (`switch.pappa_kontor_stikkontakt`) og vindussensor (`binary_sensor.rune_kontor_vindu`).
- **Aqara bevegelsessensor** (Matter) er plassert i Trappegang, til tross for at den mangler area i HA-registeret.

## Known Issues / Workarounds

- `ha-ws` krever sudo for skrivoperasjoner i `/homeassistant/` (hassio-bruker har kun lesetilgang).
- `make validate` kan feile på referansevalidatoren for utdaterte entity-IDer — dette er ikke blokkerende så lenge `validate-yaml` og `validate-ha` passerer.
- `ha-ws` hadde SSL-bug ved `ws://` URL — fikset lokalt i `/homeassistant/claude-code-ha/bin/ha-ws` (ssl-argument sendes nå kun ved `wss://`).
