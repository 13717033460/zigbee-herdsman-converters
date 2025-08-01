import {Zcl, ZSpec} from "zigbee-herdsman";

import * as fz from "../converters/fromZigbee";
import * as tz from "../converters/toZigbee";
import * as constants from "../lib/constants";
import * as exposes from "../lib/exposes";
import {logger} from "../lib/logger";
import * as m from "../lib/modernExtend";
import * as reporting from "../lib/reporting";
import * as globalStore from "../lib/store";
import type {DefinitionWithExtend, Expose, Fz, KeyValue, ModernExtend, Tz} from "../lib/types";
import * as utils from "../lib/utils";

const e = exposes.presets;
const ea = exposes.access;

const NS = "zhc:bosch";
const manufacturerOptions = {manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH};

const sirenVolume = {
    low: 0x01,
    medium: 0x02,
    high: 0x03,
};

const sirenLight = {
    only_light: 0x00,
    only_siren: 0x01,
    siren_and_light: 0x02,
};

const outdoorSirenState = {
    ON: 0x07,
    OFF: 0x00,
};

const sirenPowerSupply = {
    solar_panel: 0x01,
    ac_power_supply: 0x02,
    dc_power_supply: 0x03,
};

// Universal Switch II
const buttonMap: {[key: string]: number} = {
    config_led_top_left_press: 0x10,
    config_led_top_right_press: 0x11,
    config_led_bottom_left_press: 0x12,
    config_led_bottom_right_press: 0x13,
    config_led_top_left_longpress: 0x20,
    config_led_top_right_longpress: 0x21,
    config_led_bottom_left_longpress: 0x22,
    config_led_bottom_right_longpress: 0x23,
};

// Universal Switch II
const labelShortPress = `Specifies LED color (rgb) and pattern on short press as hex string.
0-2: RGB value (e.g. ffffff = white)
3: Light position (01=top, 02=bottom, 00=full)
4-7: Durations for sequence fade-in -> on -> fade-out -> off (e.g. 01020102)
8: Number of Repetitions (01=1 to ff=255)
Example: ff1493000104010001`;

// Universal Switch II
const labelLongPress = `Specifies LED color (rgb) and pattern on long press as hex string.
0-2: RGB value (e.g. ffffff = white)
3: Light position (01=top, 02=bottom, 00=full)
4-7: Durations for sequence fade-in -> on -> fade-out -> off (e.g. 01020102)
8: Number of Repetitions (01=1 to ff=255)
Example: ff4200000502050001`;

// Universal Switch II
const labelConfirmation = `Specifies LED color (rgb) and pattern of the confirmation response as hex string.
0-2: RGB value (e.g. ffffff = white)
3: Light position (01=top, 02=bottom, 00=full)
4-7: Durations for sequence fade-in -> on -> fade-out -> off (e.g. 01020102)
8: Number of Repetitions (01=1 to ff=255)
Example: 30ff00000102010001`;

const boschExtend = {
    hvacThermostatCluster: () =>
        m.deviceAddCustomCluster("hvacThermostat", {
            ID: Zcl.Clusters.hvacThermostat.ID,
            attributes: {
                operatingMode: {
                    ID: 0x4007,
                    type: Zcl.DataType.ENUM8,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
                heatingDemand: {
                    ID: 0x4020,
                    type: Zcl.DataType.ENUM8,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
                valveAdaptStatus: {
                    ID: 0x4022,
                    type: Zcl.DataType.ENUM8,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
                remoteTemperature: {
                    ID: 0x4040,
                    type: Zcl.DataType.INT16,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
                windowDetection: {
                    ID: 0x4042,
                    type: Zcl.DataType.ENUM8,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
                boostHeating: {
                    ID: 0x4043,
                    type: Zcl.DataType.ENUM8,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
            },
            commands: {
                calibrateValve: {
                    ID: 0x41,
                    parameters: [],
                },
            },
            commandsResponse: {},
        }),
    hvacUserInterfaceCfgCluster: () =>
        m.deviceAddCustomCluster("hvacUserInterfaceCfg", {
            ID: Zcl.Clusters.hvacUserInterfaceCfg.ID,
            attributes: {
                displayOrientation: {
                    ID: 0x400b,
                    type: Zcl.DataType.UINT8,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
                displayedTemperature: {
                    ID: 0x4039,
                    type: Zcl.DataType.ENUM8,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
                displayOntime: {
                    ID: 0x403a,
                    type: Zcl.DataType.ENUM8,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
                displayBrightness: {
                    ID: 0x403b,
                    type: Zcl.DataType.ENUM8,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
            },
            commands: {},
            commandsResponse: {},
        }),
    operatingMode: () =>
        m.enumLookup({
            name: "operating_mode",
            cluster: "hvacThermostat",
            attribute: "operatingMode",
            reporting: {min: "10_SECONDS", max: "MAX", change: null},
            description: "Bosch-specific operating mode (overrides system mode)",
            lookup: {schedule: 0x00, manual: 0x01, pause: 0x05},
            zigbeeCommandOptions: manufacturerOptions,
        }),
    windowDetection: () =>
        m.binary({
            name: "window_detection",
            cluster: "hvacThermostat",
            attribute: "windowDetection",
            description: "Enable/disable window open (Lo.) mode",
            valueOn: ["ON", 0x01],
            valueOff: ["OFF", 0x00],
            zigbeeCommandOptions: manufacturerOptions,
        }),
    boostHeating: () =>
        m.binary({
            name: "boost_heating",
            cluster: "hvacThermostat",
            attribute: "boostHeating",
            reporting: {min: "10_SECONDS", max: "MAX", change: null, attribute: "boostHeating"},
            description: "Activate boost heating (5 min. on TRV)",
            valueOn: ["ON", 0x01],
            valueOff: ["OFF", 0x00],
            zigbeeCommandOptions: manufacturerOptions,
        }),
    childLock: () =>
        m.binary({
            name: "child_lock",
            cluster: "hvacUserInterfaceCfg",
            attribute: "keypadLockout",
            description: "Enables/disables physical input on the device",
            valueOn: ["LOCK", 0x01],
            valueOff: ["UNLOCK", 0x00],
        }),
    displayOntime: () =>
        m.numeric({
            name: "display_ontime",
            cluster: "hvacUserInterfaceCfg",
            attribute: "displayOntime",
            description: "Sets the display on-time",
            valueMin: 5,
            valueMax: 30,
            unit: "s",
            zigbeeCommandOptions: manufacturerOptions,
        }),
    displayBrightness: () =>
        m.numeric({
            name: "display_brightness",
            cluster: "hvacUserInterfaceCfg",
            attribute: "displayBrightness",
            description: "Sets brightness of the display",
            valueMin: 0,
            valueMax: 10,
            zigbeeCommandOptions: manufacturerOptions,
        }),
    valveAdaptProcess: (): ModernExtend => {
        const adaptationStatus: KeyValue = {
            none: 0x00,
            ready_to_calibrate: 0x01,
            calibration_in_progress: 0x02,
            error: 0x03,
            success: 0x04,
        };
        const exposes: Expose[] = [
            e
                .binary("valve_adapt_process", ea.ALL, true, false)
                .withLabel("Trigger adaptation process")
                .withDescription('Trigger the valve adaptation process. Only possible when adaptation status is "ready_to_calibrate" or "error".')
                .withCategory("config"),
        ];
        const fromZigbee: Fz.Converter[] = [
            {
                cluster: "hvacThermostat",
                type: ["attributeReport", "readResponse"],
                convert: (model, msg, publish, options, meta) => {
                    const result: KeyValue = {};
                    if (msg.data.valveAdaptStatus !== undefined) {
                        if (msg.data.valveAdaptStatus === adaptationStatus.calibration_in_progress) {
                            result.valve_adapt_process = true;
                        } else {
                            result.valve_adapt_process = false;
                        }
                    }
                    return result;
                },
            },
        ];
        const toZigbee: Tz.Converter[] = [
            {
                key: ["valve_adapt_process"],
                convertSet: async (entity, key, value, meta) => {
                    if (value === true) {
                        const adaptStatus = utils.getFromLookup(meta.state.valve_adapt_status, adaptationStatus);
                        switch (adaptStatus) {
                            case adaptationStatus.ready_to_calibrate:
                            case adaptationStatus.error:
                                await entity.command("hvacThermostat", "calibrateValve", {}, manufacturerOptions);
                                break;
                            default:
                                throw new Error("Valve adaptation process not possible right now.");
                        }
                    }
                    return {state: {valve_adapt_process: value}};
                },
                convertGet: async (entity, key, meta) => {
                    await entity.read("hvacThermostat", ["valveAdaptStatus"], manufacturerOptions);
                },
            },
        ];
        return {
            exposes,
            fromZigbee,
            toZigbee,
            isModernExtend: true,
        };
    },
    heatingDemand: (): ModernExtend => {
        const fromZigbee: Fz.Converter[] = [
            {
                cluster: "hvacThermostat",
                type: ["attributeReport", "readResponse"],
                convert: (model, msg, publish, options, meta) => {
                    const result: KeyValue = {};
                    if (msg.data.heatingDemand !== undefined) {
                        const demand = msg.data.heatingDemand as number;
                        result.pi_heating_demand = demand;
                        result.running_state = demand > 0 ? "heat" : "idle";
                    }
                    return result;
                },
            },
        ];
        const toZigbee: Tz.Converter[] = [
            {
                key: ["pi_heating_demand"],
                convertSet: async (entity, key, value, meta) => {
                    if (key === "pi_heating_demand") {
                        let demand = utils.toNumber(value, key);
                        demand = utils.numberWithinRange(demand, 0, 100);
                        await entity.write("hvacThermostat", {heatingDemand: demand}, manufacturerOptions);
                        return {state: {pi_heating_demand: demand}};
                    }
                },
                convertGet: async (entity, key, meta) => {
                    await entity.read("hvacThermostat", ["heatingDemand"], manufacturerOptions);
                },
            },
            {
                key: ["running_state"],
                convertGet: async (entity, key, meta) => {
                    await entity.read("hvacThermostat", ["heatingDemand"], manufacturerOptions);
                },
            },
        ];
        return {
            fromZigbee,
            toZigbee,
            isModernExtend: true,
        };
    },
    ignoreDst: (): ModernExtend => {
        const fromZigbee: Fz.Converter[] = [
            {
                cluster: "genTime",
                type: "read",
                convert: async (model, msg, publish, options, meta) => {
                    if (msg.data.includes("dstStart", "dstEnd", "dstShift")) {
                        const response = {
                            dstStart: {attribute: 0x0003, status: Zcl.Status.SUCCESS, value: 0x00},
                            dstEnd: {attribute: 0x0004, status: Zcl.Status.SUCCESS, value: 0x00},
                            dstShift: {attribute: 0x0005, status: Zcl.Status.SUCCESS, value: 0x00},
                        };
                        await msg.endpoint.readResponse(msg.cluster, msg.meta.zclTransactionSequenceNumber, response);
                    }
                },
            },
        ];
        return {
            fromZigbee,
            isModernExtend: true,
        };
    },
    doorWindowContact: (hasVibrationSensor?: boolean): ModernExtend => {
        const exposes: Expose[] = [
            e.binary("contact", ea.STATE, false, true).withDescription("Indicates whether the device is opened or closed"),
            e
                .enum("action", ea.STATE, ["none", "single", "long"])
                .withDescription("Triggered action (e.g. a button click)")
                .withCategory("diagnostic"),
        ];
        if (hasVibrationSensor) {
            exposes.push(e.binary("vibration", ea.STATE, true, false).withDescription("Indicates whether the device detected vibration"));
        }
        const fromZigbee: Fz.Converter[] = [
            {
                cluster: "ssIasZone",
                type: ["commandStatusChangeNotification", "attributeReport", "readResponse"],
                convert: (model, msg, publish, options, meta) => {
                    if (msg.data.zoneStatus !== undefined || msg.data.zonestatus !== undefined) {
                        const zoneStatus = msg.type === "commandStatusChangeNotification" ? msg.data.zonestatus : msg.data.zoneStatus;
                        const lookup: KeyValue = {0: "none", 1: "single", 2: "long"};
                        const result: KeyValue = {
                            contact: !((zoneStatus & 1) > 0),
                            vibration: (zoneStatus & (1 << 1)) > 0,
                            tamper: (zoneStatus & (1 << 2)) > 0,
                            battery_low: (zoneStatus & (1 << 3)) > 0,
                            supervision_reports: (zoneStatus & (1 << 4)) > 0,
                            restore_reports: (zoneStatus & (1 << 5)) > 0,
                            trouble: (zoneStatus & (1 << 6)) > 0,
                            ac_status: (zoneStatus & (1 << 7)) > 0,
                            test: (zoneStatus & (1 << 8)) > 0,
                            battery_defect: (zoneStatus & (1 << 9)) > 0,
                            action: lookup[(zoneStatus >> 11) & 3],
                        };
                        if (result.action === "none") delete result.action;
                        return result;
                    }
                },
            },
        ];
        return {
            exposes,
            fromZigbee,
            isModernExtend: true,
        };
    },
    smokeAlarm: (): ModernExtend => {
        const smokeAlarm: KeyValue = {
            OFF: 0x0000,
            ON: 0x3c00, // 15360 or 46080 works
        };
        const burglarAlarm: KeyValue = {
            OFF: 0x0001,
            ON: 0xb401, // 46081
        };
        const exposes: Expose[] = [
            e.binary("smoke", ea.STATE, true, false).withDescription("Indicates whether the device detected smoke"),
            e
                .binary("test", ea.STATE, true, false)
                .withDescription("Indicates whether the device is currently performing a test")
                .withCategory("diagnostic"),
            e.binary("alarm_smoke", ea.ALL, true, false).withDescription("Toggle the smoke alarm siren").withCategory("config"),
            e.binary("alarm_burglar", ea.ALL, true, false).withDescription("Toggle the burglar alarm siren").withCategory("config"),
        ];
        const fromZigbee: Fz.Converter[] = [
            {
                cluster: "ssIasZone",
                type: ["commandStatusChangeNotification", "attributeReport", "readResponse"],
                convert: (model, msg, publish, options, meta) => {
                    if (msg.data.zoneStatus !== undefined || msg.data.zonestatus !== undefined) {
                        const zoneStatus = msg.type === "commandStatusChangeNotification" ? msg.data.zonestatus : msg.data.zoneStatus;
                        return {
                            smoke: (zoneStatus & 1) > 0,
                            alarm_smoke: (zoneStatus & (1 << 1)) > 0,
                            battery_low: (zoneStatus & (1 << 3)) > 0,
                            supervision_reports: (zoneStatus & (1 << 4)) > 0,
                            restore_reports: (zoneStatus & (1 << 5)) > 0,
                            alarm_burglar: (zoneStatus & (1 << 7)) > 0,
                            test: (zoneStatus & (1 << 8)) > 0,
                            alarm_silenced: (zoneStatus & (1 << 11)) > 0,
                        };
                    }
                },
            },
        ];
        const toZigbee: Tz.Converter[] = [
            {
                key: ["alarm_smoke", "alarm_burglar"],
                convertSet: async (entity, key, value, meta) => {
                    if (key === "alarm_smoke") {
                        let transformedValue = "OFF";
                        if (value === true) {
                            transformedValue = "ON";
                        }
                        const index = utils.getFromLookup(transformedValue, smokeAlarm);
                        await entity.command("ssIasZone", "boschSmokeAlarmSiren", {data: index}, manufacturerOptions);
                        return {state: {alarm_smoke: value}};
                    }
                    if (key === "alarm_burglar") {
                        let transformedValue = "OFF";
                        if (value === true) {
                            transformedValue = "ON";
                        }
                        const index = utils.getFromLookup(transformedValue, burglarAlarm);
                        await entity.command("ssIasZone", "boschSmokeAlarmSiren", {data: index}, manufacturerOptions);
                        return {state: {alarm_burglar: value}};
                    }
                },
                convertGet: async (entity, key, meta) => {
                    switch (key) {
                        case "alarm_smoke":
                        case "alarm_burglar":
                        case "zone_status":
                            await entity.read("ssIasZone", ["zoneStatus"]);
                            break;
                        default:
                            throw new Error(`Unhandled key boschExtend.smokeAlarm.toZigbee.convertGet ${key}`);
                    }
                },
            },
        ];
        return {
            exposes,
            fromZigbee,
            toZigbee,
            isModernExtend: true,
        };
    },
    broadcastAlarm: (): ModernExtend => {
        const sirenState: KeyValue = {
            smoke_off: 0x0000,
            smoke_on: 0x3c00,
            burglar_off: 0x0001,
            burglar_on: 0xb401,
        };
        const exposes: Expose[] = [
            e
                .enum("broadcast_alarm", ea.SET, Object.keys(sirenState))
                .withDescription("Set siren state of all BSD-2 via broadcast")
                .withCategory("config"),
        ];
        const toZigbee: Tz.Converter[] = [
            {
                key: ["broadcast_alarm"],
                convertSet: async (entity, key, value, meta) => {
                    if (key === "broadcast_alarm") {
                        const index = utils.getFromLookup(value, sirenState);
                        utils.assertEndpoint(entity);
                        await entity.zclCommandBroadcast(
                            255,
                            ZSpec.BroadcastAddress.SLEEPY,
                            Zcl.Clusters.ssIasZone.ID,
                            "boschSmokeAlarmSiren",
                            {data: index},
                            manufacturerOptions,
                        );
                        return;
                    }
                },
            },
        ];
        return {
            exposes,
            toZigbee,
            isModernExtend: true,
        };
    },
    twinguard: (): ModernExtend => {
        const smokeSensitivity = {
            low: 0x03,
            medium: 0x02,
            high: 0x01,
        };
        const sirenState = {
            stop: 0x00,
            pre_alarm: 0x01,
            fire: 0x02,
            burglar: 0x03,
        };
        const stateOffOn = {
            OFF: 0x00,
            ON: 0x01,
        };
        const exposes: Expose[] = [
            e.binary("smoke", ea.STATE, true, false).withDescription("Indicates whether the device detected smoke"),
            e
                .numeric("temperature", ea.STATE)
                .withValueMin(0)
                .withValueMax(65)
                .withValueStep(0.1)
                .withUnit("°C")
                .withDescription("Measured temperature value"),
            e
                .numeric("humidity", ea.STATE)
                .withValueMin(0)
                .withValueMax(100)
                .withValueStep(0.1)
                .withUnit("%")
                .withDescription("Measured relative humidity"),
            e
                .numeric("voc", ea.STATE)
                .withValueMin(0)
                .withValueMax(50000)
                .withValueStep(1)
                .withLabel("VOC")
                .withUnit("µg/m³")
                .withDescription("Measured VOC value"),
            e
                .numeric("co2", ea.STATE)
                .withValueMin(400)
                .withValueMax(2400)
                .withValueStep(1)
                .withLabel("CO2")
                .withUnit("ppm")
                .withDescription("The measured CO2 (carbon dioxide) value"),
            e.numeric("aqi", ea.STATE).withValueMin(0).withValueMax(500).withValueStep(1).withLabel("AQI").withDescription("Air Quality Index"),
            e.illuminance(),
            e
                .numeric("battery", ea.STATE)
                .withUnit("%")
                .withValueMin(0)
                .withValueMax(100)
                .withDescription("Remaining battery in %")
                .withCategory("diagnostic"),
            e.text("siren_state", ea.STATE).withDescription("Siren state").withCategory("diagnostic"),
            e.enum("alarm", ea.ALL, Object.keys(sirenState)).withDescription("Alarm mode for siren"),
            e.binary("self_test", ea.ALL, true, false).withDescription("Initiate self-test").withCategory("config"),
            e.enum("sensitivity", ea.ALL, Object.keys(smokeSensitivity)).withDescription("Sensitivity of the smoke detector").withCategory("config"),
            e.binary("pre_alarm", ea.ALL, "ON", "OFF").withDescription("Enable/disable pre-alarm").withCategory("config"),
            e.binary("heartbeat", ea.ALL, "ON", "OFF").withDescription("Enable/disable heartbeat (blue LED)").withCategory("config"),
        ];
        const fromZigbee: Fz.Converter[] = [
            {
                cluster: "twinguardSmokeDetector",
                type: ["attributeReport", "readResponse"],
                convert: (model, msg, publish, options, meta) => {
                    const result: KeyValue = {};
                    if (msg.data.sensitivity !== undefined) {
                        result.sensitivity = Object.keys(smokeSensitivity)[msg.data.sensitivity];
                    }
                    return result;
                },
            },
            {
                cluster: "twinguardMeasurements",
                type: ["attributeReport", "readResponse"],
                convert: (model, msg, publish, options, meta) => {
                    const result: KeyValue = {};
                    if (msg.data.humidity !== undefined) {
                        const humidity = utils.toNumber(msg.data.humidity) / 100.0;
                        if (utils.isInRange(0, 100, humidity)) {
                            result.humidity = humidity;
                        }
                    }
                    if (msg.data.airpurity !== undefined) {
                        const iaq = utils.toNumber(msg.data.airpurity);
                        result.aqi = iaq;
                        let factorVoc = 6;
                        let factorCo2 = 2;
                        if (iaq >= 51 && iaq <= 100) {
                            factorVoc = 10;
                            factorCo2 = 4;
                        } else if (iaq >= 101 && iaq <= 150) {
                            factorVoc = 20;
                            factorCo2 = 4;
                        } else if (iaq >= 151 && iaq <= 200) {
                            factorVoc = 50;
                            factorCo2 = 4;
                        } else if (iaq >= 201 && iaq <= 250) {
                            factorVoc = 100;
                            factorCo2 = 4;
                        } else if (iaq >= 251) {
                            factorVoc = 100;
                            factorCo2 = 4;
                        }
                        result.voc = iaq * factorVoc;
                        result.co2 = iaq * factorCo2 + 400;
                    }
                    if (msg.data.temperature !== undefined) {
                        result.temperature = utils.toNumber(msg.data.temperature) / 100.0;
                    }
                    if (msg.data.illuminance !== undefined) {
                        result.illuminance = utils.precisionRound(msg.data.illuminance / 2, 2);
                    }
                    if (msg.data.battery !== undefined) {
                        result.battery = utils.precisionRound(msg.data.battery / 2, 2);
                    }
                    return result;
                },
            },
            {
                cluster: "twinguardOptions",
                type: ["attributeReport", "readResponse"],
                convert: (model, msg, publish, options, meta) => {
                    const result: KeyValue = {};
                    if (msg.data.pre_alarm !== undefined) {
                        result.pre_alarm = Object.keys(stateOffOn)[msg.data.pre_alarm];
                    }
                    return result;
                },
            },
            {
                cluster: "twinguardSetup",
                type: ["attributeReport", "readResponse"],
                convert: (model, msg, publish, options, meta) => {
                    const result: KeyValue = {};
                    if (msg.data.heartbeat !== undefined) {
                        result.heartbeat = Object.keys(stateOffOn)[msg.data.heartbeat];
                    }
                    return result;
                },
            },
            {
                cluster: "twinguardAlarm",
                type: ["attributeReport", "readResponse"],
                convert: (model, msg, publish, options, meta) => {
                    const result: KeyValue = {};
                    const lookup: KeyValue = {
                        2097184: "clear",
                        18874400: "self_test",
                        35651616: "burglar",
                        2097282: "pre_alarm",
                        2097281: "fire",
                        2097216: "silenced",
                    };
                    if (msg.data.alarm_status !== undefined) {
                        result.self_test = (msg.data.alarm_status & (1 << 24)) > 0;
                        result.smoke = (msg.data.alarm_status & (1 << 7)) > 0;
                        result.siren_state = lookup[msg.data.alarm_status];
                    }
                    return result;
                },
            },
            {
                cluster: "genAlarms",
                type: ["commandAlarm", "readResponse"],
                convert: async (model, msg, publish, options, meta) => {
                    const result: KeyValue = {};
                    const lookup: KeyValue = {
                        16: "fire",
                        17: "pre_alarm",
                        20: "clear",
                        22: "silenced",
                    };
                    result.siren_state = lookup[msg.data.alarmcode];
                    if (msg.data.alarmcode === 0x10 || msg.data.alarmcode === 0x11) {
                        await msg.endpoint.commandResponse("genAlarms", "alarm", {alarmcode: msg.data.alarmcode, clusterid: 0xe000}, {direction: 1});
                    }
                    return result;
                },
            },
        ];
        const toZigbee: Tz.Converter[] = [
            {
                key: ["sensitivity", "pre_alarm", "self_test", "alarm", "heartbeat"],
                convertSet: async (entity, key, value, meta) => {
                    if (key === "sensitivity") {
                        const index = utils.getFromLookup(value, smokeSensitivity);
                        await entity.write("twinguardSmokeDetector", {sensitivity: index}, manufacturerOptions);
                        return {state: {sensitivity: value}};
                    }
                    if (key === "pre_alarm") {
                        const index = utils.getFromLookup(value, stateOffOn);
                        await entity.write("twinguardOptions", {pre_alarm: index}, manufacturerOptions);
                        return {state: {pre_alarm: value}};
                    }
                    if (key === "heartbeat") {
                        const endpoint = meta.device.getEndpoint(12);
                        const index = utils.getFromLookup(value, stateOffOn);
                        await endpoint.write("twinguardSetup", {heartbeat: index}, manufacturerOptions);
                        return {state: {heartbeat: value}};
                    }
                    if (key === "self_test") {
                        if (value) {
                            await entity.command("twinguardSmokeDetector", "initiateTestMode", manufacturerOptions);
                        }
                    }
                    if (key === "alarm") {
                        const endpoint = meta.device.getEndpoint(12);
                        const index = utils.getFromLookup(value, sirenState);
                        utils.assertEndpoint(entity);
                        if (index === 0x00) {
                            await entity.commandResponse("genAlarms", "alarm", {alarmcode: 0x16, clusterid: 0xe000}, {direction: 1});
                            await entity.commandResponse("genAlarms", "alarm", {alarmcode: 0x14, clusterid: 0xe000}, {direction: 1});
                            await endpoint.command("twinguardAlarm", "burglarAlarm", {data: 0x00}, manufacturerOptions);
                        } else if (index === 0x01) {
                            await entity.commandResponse("genAlarms", "alarm", {alarmcode: 0x11, clusterid: 0xe000}, {direction: 1});
                            return {state: {siren_state: "pre_alarm"}};
                        } else if (index === 0x02) {
                            await entity.commandResponse("genAlarms", "alarm", {alarmcode: 0x10, clusterid: 0xe000}, {direction: 1});
                            return {state: {siren_state: "fire"}};
                        } else if (index === 0x03) {
                            await endpoint.command("twinguardAlarm", "burglarAlarm", {data: 0x01}, manufacturerOptions);
                        }
                    }
                },
                convertGet: async (entity, key, meta) => {
                    switch (key) {
                        case "sensitivity":
                            await entity.read("twinguardSmokeDetector", ["sensitivity"], manufacturerOptions);
                            break;
                        case "pre_alarm":
                            await entity.read("twinguardOptions", ["pre_alarm"], manufacturerOptions);
                            break;
                        case "heartbeat":
                            await meta.device.getEndpoint(12).read("twinguardSetup", ["heartbeat"], manufacturerOptions);
                            break;
                        case "alarm":
                        case "self_test":
                            await meta.device.getEndpoint(12).read("twinguardAlarm", ["alarm_status"], manufacturerOptions);
                            break;
                        default:
                            throw new Error(`Unhandled key boschExtend.twinguard.toZigbee.convertGet ${key}`);
                    }
                },
            },
        ];
        return {
            exposes,
            fromZigbee,
            toZigbee,
            isModernExtend: true,
        };
    },
    bmct: (): ModernExtend => {
        const stateDeviceMode: KeyValue = {
            light: 0x04,
            shutter: 0x01,
            disabled: 0x00,
        };
        const stateMotor: KeyValue = {
            stopped: 0x00,
            opening: 0x01,
            closing: 0x02,
        };
        const stateSwitchType: KeyValue = {
            button: 0x01,
            button_key_change: 0x02,
            rocker_switch: 0x03,
            rocker_switch_key_change: 0x04,
        };
        const stateOffOn = {
            OFF: 0x00,
            ON: 0x01,
        };
        const fromZigbee: Fz.Converter[] = [
            fz.on_off,
            fz.power_on_behavior,
            fz.cover_position_tilt,
            {
                cluster: "boschSpecific",
                type: ["attributeReport", "readResponse"],
                convert: (model, msg, publish, options, meta) => {
                    const result: KeyValue = {};
                    const data = msg.data;
                    if (data.deviceMode !== undefined) {
                        result.device_mode = Object.keys(stateDeviceMode).find((key) => stateDeviceMode[key] === msg.data.deviceMode);
                        const deviceMode = msg.data.deviceMode;
                        if (deviceMode !== meta.device.meta.deviceMode) {
                            meta.device.meta.deviceMode = deviceMode;
                            meta.deviceExposesChanged();
                        }
                    }
                    if (data.switchType !== undefined) {
                        result.switch_type = Object.keys(stateSwitchType).find((key) => stateSwitchType[key] === msg.data.switchType);
                    }
                    if (data.calibrationOpeningTime !== undefined) {
                        result.calibration_opening_time = msg.data.calibrationOpeningTime / 10;
                    }
                    if (data.calibrationClosingTime !== undefined) {
                        result.calibration_closing_time = msg.data.calibrationClosingTime / 10;
                    }
                    if (data.calibrationButtonHoldTime !== undefined) {
                        result.calibration_button_hold_time = msg.data.calibrationButtonHoldTime / 10;
                    }
                    if (data.calibrationMotorStartDelay !== undefined) {
                        result.calibration_motor_start_delay = msg.data.calibrationMotorStartDelay / 10;
                    }
                    if (data.childLock !== undefined) {
                        const property = utils.postfixWithEndpointName("child_lock", msg, model, meta);
                        result[property] = msg.data.childLock === 1 ? "ON" : "OFF";
                    }
                    if (data.motorState !== undefined) {
                        result.motor_state = Object.keys(stateMotor).find((key) => stateMotor[key] === msg.data.motorState);
                    }
                    return result;
                },
            },
        ];
        const toZigbee: Tz.Converter[] = [
            tz.power_on_behavior,
            tz.cover_position_tilt,
            {
                key: ["device_mode", "switch_type", "child_lock", "state", "on_time", "off_wait_time"],
                convertSet: async (entity, key, value, meta) => {
                    if (key === "state") {
                        if ("ID" in entity && entity.ID === 1) {
                            await tz.cover_state.convertSet(entity, key, value, meta);
                        } else {
                            await tz.on_off.convertSet(entity, key, value, meta);
                        }
                    }
                    if (key === "on_time" || key === "on_wait_time") {
                        if ("ID" in entity && entity.ID !== 1) {
                            await tz.on_off.convertSet(entity, key, value, meta);
                        }
                    }
                    if (key === "device_mode") {
                        const index = utils.getFromLookup(value, stateDeviceMode);
                        await entity.write("boschSpecific", {deviceMode: index});
                        await entity.read("boschSpecific", ["deviceMode"]);
                        return {state: {device_mode: value}};
                    }
                    if (key === "switch_type") {
                        const index = utils.getFromLookup(value, stateSwitchType);
                        await entity.write("boschSpecific", {switchType: index});
                        return {state: {switch_type: value}};
                    }
                    if (key === "child_lock") {
                        const index = utils.getFromLookup(value, stateOffOn);
                        await entity.write("boschSpecific", {childLock: index});
                        return {state: {child_lock: value}};
                    }
                },
                convertGet: async (entity, key, meta) => {
                    switch (key) {
                        case "state":
                        case "on_time":
                        case "off_wait_time":
                            if ("ID" in entity && entity.ID !== 1) {
                                await entity.read("genOnOff", ["onOff"]);
                            }
                            break;
                        case "device_mode":
                            await entity.read("boschSpecific", ["deviceMode"]);
                            break;
                        case "switch_type":
                            await entity.read("boschSpecific", ["switchType"]);
                            break;
                        case "child_lock":
                            await entity.read("boschSpecific", ["childLock"]);
                            break;
                        default:
                            throw new Error(`Unhandled key boschExtend.bmct.toZigbee.convertGet ${key}`);
                    }
                },
            },
            {
                key: ["calibration_closing_time", "calibration_opening_time", "calibration_button_hold_time", "calibration_motor_start_delay"],
                convertSet: async (entity, key, value, meta) => {
                    if (key === "calibration_opening_time") {
                        const number = utils.toNumber(value, "calibration_opening_time");
                        const index = number * 10;
                        await entity.write("boschSpecific", {calibrationOpeningTime: index});
                        return {state: {calibration_opening_time: number}};
                    }
                    if (key === "calibration_closing_time") {
                        const number = utils.toNumber(value, "calibration_closing_time");
                        const index = number * 10;
                        await entity.write("boschSpecific", {calibrationClosingTime: index});
                        return {state: {calibration_closing_time: number}};
                    }
                    if (key === "calibration_button_hold_time") {
                        const number = utils.toNumber(value, "calibration_button_hold_time");
                        const index = number * 10;
                        await entity.write("boschSpecific", {calibrationButtonHoldTime: index});
                        return {state: {calibration_button_hold_time: number}};
                    }
                    if (key === "calibration_motor_start_delay") {
                        const number = utils.toNumber(value, "calibration_motor_start_delay");
                        const index = number * 10;
                        await entity.write("boschSpecific", {calibrationMotorStartDelay: index});
                        return {state: {calibration_motor_start_delay: number}};
                    }
                },
                convertGet: async (entity, key, meta) => {
                    switch (key) {
                        case "calibration_opening_time":
                            await entity.read("boschSpecific", ["calibrationOpeningTime"]);
                            break;
                        case "calibration_closing_time":
                            await entity.read("boschSpecific", ["calibrationClosingTime"]);
                            break;
                        case "calibration_button_hold_time":
                            await entity.read("boschSpecific", ["calibrationButtonHoldTime"]);
                            break;
                        case "calibration_motor_start_delay":
                            await entity.read("boschSpecific", ["calibrationMotorStartDelay"]);
                            break;
                        default:
                            throw new Error(`Unhandled key boschExtend.bmct.toZigbee.convertGet ${key}`);
                    }
                },
            },
        ];
        return {
            fromZigbee,
            toZigbee,
            isModernExtend: true,
        };
    },
};
const tzLocal = {
    rbshoszbeu: {
        key: ["light_delay", "siren_delay", "light_duration", "siren_duration", "siren_volume", "alarm_state", "power_source", "siren_and_light"],
        convertSet: async (entity, key, value, meta) => {
            if (key === "light_delay") {
                const index = value;
                await entity.write(0x0502, {40964: {value: index, type: 0x21}}, manufacturerOptions);
                return {state: {light_delay: value}};
            }
            if (key === "siren_delay") {
                const index = value;
                await entity.write(0x0502, {40963: {value: index, type: 0x21}}, manufacturerOptions);
                return {state: {siren_delay: value}};
            }
            if (key === "light_duration") {
                const index = value;
                await entity.write(0x0502, {40965: {value: index, type: 0x20}}, manufacturerOptions);
                return {state: {light_duration: value}};
            }
            if (key === "siren_duration") {
                const index = value;
                await entity.write(0x0502, {40960: {value: index, type: 0x20}}, manufacturerOptions);
                return {state: {siren_duration: value}};
            }
            if (key === "siren_and_light") {
                const index = utils.getFromLookup(value, sirenLight);
                await entity.write(0x0502, {40961: {value: index, type: 0x20}}, manufacturerOptions);
                return {state: {siren_and_light: value}};
            }
            if (key === "siren_volume") {
                const index = utils.getFromLookup(value, sirenVolume);
                await entity.write(0x0502, {40962: {value: index, type: 0x20}}, manufacturerOptions);
                return {state: {siren_volume: value}};
            }
            if (key === "power_source") {
                const index = utils.getFromLookup(value, sirenPowerSupply);
                await entity.write(0x0001, {40962: {value: index, type: 0x20}}, manufacturerOptions);
                return {state: {power_source: value}};
            }
            if (key === "alarm_state") {
                const endpoint = meta.device.getEndpoint(1);
                const index = utils.getFromLookup(value, outdoorSirenState);
                if (index === 0) {
                    await endpoint.command(0x0502, 0xf0, {data: 0}, manufacturerOptions);
                    return {state: {alarm_state: value}};
                }
                await endpoint.command(0x0502, 0xf0, {data: 7}, manufacturerOptions);
                return {state: {alarm_state: value}};
            }
        },
        convertGet: async (entity, key, meta) => {
            switch (key) {
                case "light_delay":
                    await entity.read(0x0502, [0xa004], manufacturerOptions);
                    break;
                case "siren_delay":
                    await entity.read(0x0502, [0xa003], manufacturerOptions);
                    break;
                case "light_duration":
                    await entity.read(0x0502, [0xa005], manufacturerOptions);
                    break;
                case "siren_duration":
                    await entity.read(0x0502, [0xa000], manufacturerOptions);
                    break;
                case "siren_and_light":
                    await entity.read(0x0502, [0xa001], manufacturerOptions);
                    break;
                case "siren_volume":
                    await entity.read(0x0502, [0xa002], manufacturerOptions);
                    break;
                case "alarm_state":
                    await entity.read(0x0502, [0xf0], manufacturerOptions);
                    break;
                default: // Unknown key
                    throw new Error(`Unhandled key toZigbee.rbshoszbeu.convertGet ${key}`);
            }
        },
    } satisfies Tz.Converter,
    bhius_config: {
        key: Object.keys(buttonMap),
        convertGet: async (entity, key, meta) => {
            if (buttonMap[key] === undefined) {
                throw new Error(`Unknown key ${key}`);
            }
            await entity.read("boschSpecific", [buttonMap[key as keyof typeof buttonMap]], manufacturerOptions);
        },
        convertSet: async (entity, key, value, meta) => {
            if (buttonMap[key] === undefined) {
                return;
            }

            const buffer = Buffer.from(value as string, "hex");
            if (buffer.length !== 9) throw new Error(`Invalid configuration length: ${buffer.length} (should be 9)`);

            const payload: {[key: number | string]: KeyValue} = {};
            payload[buttonMap[key as keyof typeof buttonMap]] = {value: buffer, type: 65};
            await entity.write("boschSpecific", payload, manufacturerOptions);

            const result: {[key: number | string]: string} = {};
            result[key] = value as string;
            return {state: result};
        },
    } satisfies Tz.Converter,
};

const fzLocal = {
    bhius_button_press: {
        cluster: "boschSpecific",
        type: "raw",
        options: [e.text("led_response", ea.ALL).withLabel("LED config (confirmation response)").withDescription(labelConfirmation)],
        convert: (model, msg, publish, options, meta) => {
            const sequenceNumber = msg.data.readUInt8(3);
            const buttonId = msg.data.readUInt8(4);
            const longPress = msg.data.readUInt8(5);
            const duration = msg.data.readUInt16LE(6);
            // biome-ignore lint/suspicious/noImplicitAnyLet: ignored using `--suppress`
            let buffer;
            if (options.led_response != null) {
                buffer = Buffer.from(options.led_response as string, "hex");
                if (buffer.length !== 9) {
                    logger.error(`Invalid length of led_response: ${buffer.length} (should be 9)`, NS);
                    buffer = Buffer.from("30ff00000102010001", "hex");
                }
            } else {
                buffer = Buffer.from("30ff00000102010001", "hex");
            }

            if (utils.hasAlreadyProcessedMessage(msg, model, sequenceNumber)) return;
            const buttons: {[key: number]: string} = {0: "top_left", 1: "top_right", 2: "bottom_left", 3: "bottom_right"};

            let command = "";
            if (buttonId in buttons) {
                if (longPress && duration > 0) {
                    if (globalStore.hasValue(msg.endpoint, buttons[buttonId])) return;
                    globalStore.putValue(msg.endpoint, buttons[buttonId], duration);
                    command = "longpress";
                } else {
                    globalStore.clearValue(msg.endpoint, buttons[buttonId]);
                    command = longPress ? "longpress_release" : "release";
                    msg.endpoint.command("boschSpecific", "confirmButtonPressed", {data: buffer}, {sendPolicy: "immediate"}).catch((error) => {});
                }
                return {action: `button_${buttons[buttonId]}_${command}`};
            }
            logger.error(`Received message with unknown command ID ${buttonId}. Data: 0x${msg.data.toString("hex")}`, NS);
        },
    } satisfies Fz.Converter,
    bhius_config: {
        cluster: "boschSpecific",
        type: ["attributeReport", "readResponse"],
        convert: (model, msg, publish, options, meta) => {
            const result: {[key: number | string]: string} = {};
            for (const id of Object.values(buttonMap)) {
                if (msg.data[id] !== undefined) {
                    result[Object.keys(buttonMap).find((key) => buttonMap[key] === id)] = msg.data[id].toString("hex");
                }
            }
            return result;
        },
    } satisfies Fz.Converter,
};

export const definitions: DefinitionWithExtend[] = [
    {
        zigbeeModel: ["RBSH-OS-ZB-EU"],
        model: "BSIR-EZ",
        vendor: "Bosch",
        description: "Outdoor siren",
        fromZigbee: [fz.battery, fz.power_source],
        toZigbee: [tzLocal.rbshoszbeu, tz.warning],
        meta: {battery: {voltageToPercentage: {min: 2500, max: 4200}}},
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, ["genPowerCfg", "ssIasZone", "ssIasWd", "genBasic"]);
            await reporting.batteryVoltage(endpoint);
            await endpoint.read(0x0502, [0xa000, 0xa001, 0xa002, 0xa003, 0xa004, 0xa005], manufacturerOptions);
            if (endpoint.binds.some((b) => b.cluster.name === "genPollCtrl")) {
                await endpoint.unbind("genPollCtrl", coordinatorEndpoint);
            }
        },
        exposes: [
            e.binary("alarm_state", ea.ALL, "ON", "OFF").withDescription("Alarm turn ON/OFF"),
            e
                .numeric("light_delay", ea.ALL)
                .withValueMin(0)
                .withValueMax(30)
                .withValueStep(1)
                .withUnit("s")
                .withDescription("Flashing light delay")
                .withUnit("s"),
            e
                .numeric("siren_delay", ea.ALL)
                .withValueMin(0)
                .withValueMax(30)
                .withValueStep(1)
                .withUnit("s")
                .withDescription("Siren alarm delay")
                .withUnit("s"),
            e
                .numeric("siren_duration", ea.ALL)
                .withValueMin(1)
                .withValueMax(15)
                .withValueStep(1)
                .withUnit("m")
                .withDescription("Duration of the alarm siren")
                .withUnit("m"),
            e
                .numeric("light_duration", ea.ALL)
                .withValueMin(1)
                .withValueMax(15)
                .withValueStep(1)
                .withUnit("m")
                .withDescription("Duration of the alarm light")
                .withUnit("m"),
            e.enum("siren_volume", ea.ALL, Object.keys(sirenVolume)).withDescription("Volume of the alarm"),
            e.enum("siren_and_light", ea.ALL, Object.keys(sirenLight)).withDescription("Siren and Light behaviour during alarm "),
            e.enum("power_source", ea.ALL, Object.keys(sirenPowerSupply)).withDescription("Siren power source"),
            e
                .warning()
                .removeFeature("strobe_level")
                .removeFeature("strobe")
                .removeFeature("strobe_duty_cycle")
                .removeFeature("level")
                .removeFeature("duration"),
            e.test(),
            e.battery(),
            e.battery_voltage(),
            e.binary("ac_status", ea.STATE, true, false).withDescription("Is the device plugged in"),
        ],
        extend: [
            m.iasZoneAlarm({zoneType: "alarm", zoneAttributes: ["alarm_1", "tamper", "battery_low"]}),
            m.deviceAddCustomCluster("ssIasZone", {
                ID: Zcl.Clusters.ssIasZone.ID,
                attributes: {},
                commands: {
                    boschTestTamper: {
                        ID: 0xf3,
                        parameters: [{name: "data", type: Zcl.DataType.UINT8}],
                    },
                },
                commandsResponse: {},
            }),
            m.deviceAddCustomCluster("ssIasWd", {
                ID: Zcl.Clusters.ssIasWd.ID,
                attributes: {},
                commands: {
                    boschOutdoorSiren: {
                        ID: 240,
                        parameters: [{name: "data", type: Zcl.DataType.UINT8}],
                    },
                },
                commandsResponse: {},
            }),
            m.quirkCheckinInterval(0),
        ],
    },
    {
        zigbeeModel: ["RBSH-WS-ZB-EU"],
        model: "BWA-1",
        vendor: "Bosch",
        description: "Smart water alarm",
        extend: [
            m.deviceAddCustomCluster("boschSpecific", {
                ID: 0xfcac,
                manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                attributes: {
                    alarmOnMotion: {
                        ID: 0x0003,
                        type: Zcl.DataType.BOOLEAN,
                    },
                },
                commands: {},
                commandsResponse: {},
            }),
            m.iasZoneAlarm({
                zoneType: "water_leak",
                zoneAttributes: ["alarm_1", "tamper"],
            }),
            m.battery({
                percentage: true,
                lowStatus: true,
            }),
            m.binary({
                name: "alarm_on_motion",
                cluster: "boschSpecific",
                attribute: "alarmOnMotion",
                description: "Toggle audible alarm on motion",
                valueOn: ["ON", 0x01],
                valueOff: ["OFF", 0x00],
                zigbeeCommandOptions: manufacturerOptions,
                entityCategory: "config",
            }),
            m.bindCluster({
                cluster: "genPollCtrl",
                clusterType: "input",
            }),
        ],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await endpoint.read("genPowerCfg", ["batteryPercentageRemaining"]);
            await endpoint.read("ssIasZone", ["zoneStatus"]);
            await endpoint.read("boschSpecific", ["alarmOnMotion"], manufacturerOptions);
        },
    },
    {
        zigbeeModel: ["RBSH-SD-ZB-EU"],
        model: "BSD-2",
        vendor: "Bosch",
        description: "Smoke alarm II",
        extend: [
            m.deviceAddCustomCluster("ssIasZone", {
                ID: Zcl.Clusters.ssIasZone.ID,
                attributes: {},
                commands: {
                    boschSmokeAlarmSiren: {
                        ID: 0x80,
                        parameters: [{name: "data", type: Zcl.DataType.UINT16}],
                    },
                },
                commandsResponse: {},
            }),
            boschExtend.smokeAlarm(),
            m.battery({
                percentage: true,
                lowStatus: false,
            }),
            m.enumLookup({
                name: "sensitivity",
                cluster: "ssIasZone",
                attribute: "currentZoneSensitivityLevel",
                description: "Sensitivity of the smoke detector",
                lookup: {
                    low: 0x00,
                    medium: 0x01,
                    high: 0x02,
                },
                entityCategory: "config",
            }),
            boschExtend.broadcastAlarm(),
            m.bindCluster({
                cluster: "genPollCtrl",
                clusterType: "input",
            }),
        ],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await endpoint.read("genPowerCfg", ["batteryPercentageRemaining"]);
            await endpoint.read("ssIasZone", ["zoneStatus"]);
            await endpoint.read("ssIasZone", ["currentZoneSensitivityLevel"]);
        },
    },
    {
        zigbeeModel: [
            "RFDL-ZB",
            "RFDL-ZB-EU",
            "RFDL-ZB-H",
            "RFDL-ZB-K",
            "RFDL-ZB-CHI",
            "RFDL-ZB-MS",
            "RFDL-ZB-ES",
            "RFPR-ZB",
            "RFPR-ZB-EU",
            "RFPR-ZB-CHI",
            "RFPR-ZB-ES",
            "RFPR-ZB-MS",
        ],
        model: "RADION TriTech ZB",
        vendor: "Bosch",
        description: "Wireless motion detector",
        fromZigbee: [fz.temperature, fz.battery, fz.ias_occupancy_alarm_1],
        toZigbee: [],
        meta: {battery: {voltageToPercentage: {min: 2500, max: 3000}}},
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, ["msTemperatureMeasurement", "genPowerCfg"]);
            await reporting.temperature(endpoint);
            await reporting.batteryVoltage(endpoint);
        },
        exposes: [e.temperature(), e.battery(), e.occupancy(), e.battery_low(), e.tamper()],
        extend: [m.illuminance()],
    },
    {
        zigbeeModel: ["ISW-ZPR1-WP13"],
        model: "ISW-ZPR1-WP13",
        vendor: "Bosch",
        description: "Motion sensor",
        fromZigbee: [fz.temperature, fz.battery, fz.ias_occupancy_alarm_1, fz.ignore_iaszone_report],
        toZigbee: [],
        meta: {battery: {voltageToPercentage: {min: 2500, max: 3000}}},
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(5);
            await reporting.bind(endpoint, coordinatorEndpoint, ["msTemperatureMeasurement", "genPowerCfg"]);
            await reporting.temperature(endpoint);
            await reporting.batteryVoltage(endpoint);
        },
        exposes: [e.temperature(), e.battery(), e.occupancy(), e.battery_low(), e.tamper()],
    },
    {
        zigbeeModel: ["RBSH-TRV0-ZB-EU", "RBSH-TRV1-ZB-EU"],
        model: "BTH-RA",
        vendor: "Bosch",
        description: "Radiator thermostat II",
        meta: {
            overrideHaDiscoveryPayload: (payload) => {
                // Override climate discovery
                // https://github.com/Koenkk/zigbee2mqtt/pull/23075#issue-2355829475
                if (payload.mode_command_topic?.endsWith("/system_mode")) {
                    payload.mode_command_topic = payload.mode_command_topic.substring(0, payload.mode_command_topic.lastIndexOf("/system_mode"));
                    payload.mode_command_template =
                        "{% set values = " +
                        `{ 'auto':'schedule','heat':'manual','off':'pause'} %}` +
                        `{"operating_mode": "{{ values[value] if value in values.keys() else 'pause' }}"}`;
                    payload.mode_state_template =
                        "{% set values = " +
                        `{'schedule':'auto','manual':'heat','pause':'off'} %}` +
                        `{% set value = value_json.operating_mode %}{{ values[value] if value in values.keys() else 'off' }}`;
                    payload.modes = ["off", "heat", "auto"];
                }
            },
        },
        exposes: [
            e
                .climate()
                .withLocalTemperature(
                    ea.STATE_GET,
                    "Temperature used by the heating algorithm. " +
                        "This is the temperature measured on the device (by default) or the remote temperature (if set within the last 30 min).",
                )
                .withLocalTemperatureCalibration(-5, 5, 0.1)
                .withSetpoint("occupied_heating_setpoint", 5, 30, 0.5)
                .withSystemMode(["heat"])
                .withRunningState(["idle", "heat"], ea.STATE_GET),
            e.pi_heating_demand().withAccess(ea.ALL),
        ],
        fromZigbee: [fz.thermostat],
        toZigbee: [
            tz.thermostat_system_mode,
            tz.thermostat_occupied_heating_setpoint,
            tz.thermostat_local_temperature_calibration,
            tz.thermostat_local_temperature,
            tz.thermostat_keypad_lockout,
        ],
        extend: [
            boschExtend.hvacThermostatCluster(),
            boschExtend.hvacUserInterfaceCfgCluster(),
            m.battery({
                percentage: true,
                lowStatus: false,
            }),
            boschExtend.operatingMode(),
            boschExtend.windowDetection(),
            boschExtend.boostHeating(),
            m.numeric({
                name: "remote_temperature",
                cluster: "hvacThermostat",
                attribute: "remoteTemperature",
                description: "Input for remote temperature sensor. Required at least every 30 min. to prevent fallback to internal sensor!",
                valueMin: 0.0,
                valueMax: 35.0,
                valueStep: 0.01,
                unit: "°C",
                scale: 100,
                zigbeeCommandOptions: manufacturerOptions,
            }),
            m.enumLookup({
                name: "setpoint_change_source",
                cluster: "hvacThermostat",
                attribute: "setpointChangeSource",
                reporting: {min: "10_SECONDS", max: "MAX", change: null},
                description: "Source of the current setpoint temperature",
                lookup: {manual: 0x00, schedule: 0x01, externally: 0x02},
                access: "STATE_GET",
            }),
            boschExtend.childLock(),
            boschExtend.displayOntime(),
            boschExtend.displayBrightness(),
            m.enumLookup({
                name: "display_orientation",
                cluster: "hvacUserInterfaceCfg",
                attribute: "displayOrientation",
                description: "Sets orientation of the display",
                lookup: {normal: 0x00, flipped: 0x01},
                zigbeeCommandOptions: manufacturerOptions,
            }),
            m.enumLookup({
                name: "displayed_temperature",
                cluster: "hvacUserInterfaceCfg",
                attribute: "displayedTemperature",
                description: "Temperature displayed on the TRV",
                lookup: {target: 0x00, measured: 0x01},
                zigbeeCommandOptions: manufacturerOptions,
            }),
            m.enumLookup({
                name: "valve_adapt_status",
                cluster: "hvacThermostat",
                attribute: "valveAdaptStatus",
                reporting: {min: "10_SECONDS", max: "MAX", change: null},
                description: "Specifies the current status of the valve adaptation",
                lookup: {
                    none: 0x00,
                    ready_to_calibrate: 0x01,
                    calibration_in_progress: 0x02,
                    error: 0x03,
                    success: 0x04,
                },
                zigbeeCommandOptions: manufacturerOptions,
                access: "STATE_GET",
            }),
            boschExtend.valveAdaptProcess(),
            boschExtend.heatingDemand(),
            boschExtend.ignoreDst(),
            m.bindCluster({
                cluster: "genPollCtrl",
                clusterType: "input",
            }),
        ],
        ota: true,
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, ["hvacThermostat", "hvacUserInterfaceCfg"]);
            await reporting.thermostatTemperature(endpoint);
            await reporting.thermostatOccupiedHeatingSetpoint(endpoint, {
                min: constants.repInterval.SECONDS_10,
                max: constants.repInterval.HOUR,
                change: 50,
            });
            await reporting.thermostatKeypadLockMode(endpoint);
            await endpoint.configureReporting(
                "hvacThermostat",
                [
                    {
                        attribute: "heatingDemand",
                        minimumReportInterval: constants.repInterval.SECONDS_10,
                        maximumReportInterval: constants.repInterval.MAX,
                        reportableChange: null,
                    },
                ],
                manufacturerOptions,
            );
            await endpoint.read("genPowerCfg", ["batteryPercentageRemaining"]);
            await endpoint.read("hvacThermostat", ["localTemperatureCalibration", "setpointChangeSource"]);
            await endpoint.read(
                "hvacThermostat",
                ["operatingMode", "heatingDemand", "valveAdaptStatus", "remoteTemperature", "windowDetection", "boostHeating"],
                manufacturerOptions,
            );
            await endpoint.read("hvacUserInterfaceCfg", ["keypadLockout"]);
            await endpoint.read(
                "hvacUserInterfaceCfg",
                ["displayOrientation", "displayedTemperature", "displayOntime", "displayBrightness"],
                manufacturerOptions,
            );
        },
    },
    {
        zigbeeModel: ["RBSH-RTH0-BAT-ZB-EU"],
        model: "BTH-RM",
        vendor: "Bosch",
        description: "Room thermostat II (Battery model)",
        exposes: [
            e
                .climate()
                .withLocalTemperature()
                .withSetpoint("occupied_heating_setpoint", 4.5, 30, 0.5)
                .withSetpoint("occupied_cooling_setpoint", 4.5, 30, 0.5)
                .withLocalTemperatureCalibration(-5, 5, 0.1)
                .withSystemMode(["off", "heat", "cool"])
                .withRunningState(["idle", "heat", "cool"]),
        ],
        fromZigbee: [fz.thermostat, fz.hvac_user_interface],
        toZigbee: [
            tz.thermostat_system_mode,
            tz.thermostat_running_state,
            tz.thermostat_occupied_heating_setpoint,
            tz.thermostat_occupied_cooling_setpoint,
            tz.thermostat_programming_operation_mode, // NOTE: Only 0x0 & 0x1 supported
            tz.thermostat_local_temperature_calibration,
            tz.thermostat_local_temperature,
            tz.thermostat_temperature_setpoint_hold,
            tz.thermostat_temperature_display_mode,
        ],
        extend: [
            boschExtend.hvacThermostatCluster(),
            boschExtend.hvacUserInterfaceCfgCluster(),
            m.battery({
                voltageToPercentage: {min: 4400, max: 6400},
                percentage: true,
                voltage: true,
                lowStatus: false,
                voltageReporting: true,
                percentageReporting: false,
            }),
            m.humidity(),
            boschExtend.operatingMode(),
            boschExtend.windowDetection(),
            boschExtend.boostHeating(),
            boschExtend.childLock(),
            boschExtend.displayOntime(),
            boschExtend.displayBrightness(),
            m.bindCluster({
                cluster: "genPollCtrl",
                clusterType: "input",
            }),
        ],
        ota: true,
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, ["hvacThermostat", "hvacUserInterfaceCfg"]);
            await reporting.thermostatSystemMode(endpoint);
            await reporting.thermostatRunningState(endpoint);
            await reporting.thermostatTemperature(endpoint);
            await reporting.thermostatOccupiedHeatingSetpoint(endpoint, {
                min: constants.repInterval.SECONDS_10,
                max: constants.repInterval.HOUR,
                change: 50,
            });
            await reporting.thermostatOccupiedCoolingSetpoint(endpoint, {
                min: constants.repInterval.SECONDS_10,
                max: constants.repInterval.HOUR,
                change: 50,
            });
            await reporting.thermostatKeypadLockMode(endpoint);
            await endpoint.read("genPowerCfg", ["batteryVoltage"]);
            await endpoint.read("hvacThermostat", ["localTemperatureCalibration"]);
            await endpoint.read("hvacThermostat", ["operatingMode", "windowDetection", "boostHeating"], manufacturerOptions);
            await endpoint.read("hvacUserInterfaceCfg", ["keypadLockout"]);
            await endpoint.read("hvacUserInterfaceCfg", ["displayOntime", "displayBrightness"], manufacturerOptions);
        },
    },
    {
        zigbeeModel: ["RBSH-RTH0-ZB-EU"],
        model: "BTH-RM230Z",
        vendor: "Bosch",
        description: "Room thermostat II 230V",
        exposes: [
            e
                .climate()
                .withLocalTemperature()
                .withSetpoint("occupied_heating_setpoint", 4.5, 30, 0.5)
                .withSetpoint("occupied_cooling_setpoint", 4.5, 30, 0.5)
                .withLocalTemperatureCalibration(-5, 5, 0.1)
                .withSystemMode(["off", "heat", "cool"])
                .withRunningState(["idle", "heat", "cool"]),
        ],
        fromZigbee: [fz.thermostat, fz.hvac_user_interface],
        toZigbee: [
            tz.thermostat_system_mode,
            tz.thermostat_running_state,
            tz.thermostat_occupied_heating_setpoint,
            tz.thermostat_occupied_cooling_setpoint,
            tz.thermostat_programming_operation_mode, // NOTE: Only 0x0 & 0x1 supported
            tz.thermostat_local_temperature_calibration,
            tz.thermostat_local_temperature,
            tz.thermostat_temperature_setpoint_hold,
            tz.thermostat_temperature_display_mode,
        ],
        extend: [
            boschExtend.hvacThermostatCluster(),
            boschExtend.hvacUserInterfaceCfgCluster(),
            m.humidity(),
            boschExtend.operatingMode(),
            boschExtend.windowDetection(),
            boschExtend.boostHeating(),
            boschExtend.childLock(),
            boschExtend.displayOntime(),
            boschExtend.displayBrightness(),
        ],
        ota: true,
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, ["hvacThermostat", "hvacUserInterfaceCfg"]);
            await reporting.thermostatSystemMode(endpoint);
            await reporting.thermostatRunningState(endpoint);
            await reporting.thermostatTemperature(endpoint);
            await reporting.thermostatOccupiedHeatingSetpoint(endpoint, {
                min: constants.repInterval.SECONDS_10,
                max: constants.repInterval.HOUR,
                change: 50,
            });
            await reporting.thermostatOccupiedCoolingSetpoint(endpoint, {
                min: constants.repInterval.SECONDS_10,
                max: constants.repInterval.HOUR,
                change: 50,
            });
            await reporting.thermostatKeypadLockMode(endpoint);
            await endpoint.read("hvacThermostat", ["localTemperatureCalibration"]);
            await endpoint.read("hvacThermostat", ["operatingMode", "windowDetection", "boostHeating"], manufacturerOptions);
            await endpoint.read("hvacUserInterfaceCfg", ["keypadLockout"]);
            await endpoint.read("hvacUserInterfaceCfg", ["displayOntime", "displayBrightness"], manufacturerOptions);
        },
    },
    {
        zigbeeModel: ["Champion"],
        model: "8750001213",
        vendor: "Bosch",
        description: "Twinguard",
        extend: [
            m.deviceAddCustomCluster("twinguardSmokeDetector", {
                ID: 0xe000,
                manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                attributes: {
                    sensitivity: {ID: 0x4003, type: Zcl.DataType.UINT16},
                },
                commands: {
                    initiateTestMode: {
                        ID: 0x00,
                        parameters: [],
                    },
                },
                commandsResponse: {},
            }),
            m.deviceAddCustomCluster("twinguardMeasurements", {
                ID: 0xe002,
                manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                attributes: {
                    humidity: {ID: 0x4000, type: Zcl.DataType.UINT16},
                    unknown1: {ID: 0x4001, type: Zcl.DataType.UINT16},
                    unknown2: {ID: 0x4002, type: Zcl.DataType.UINT16},
                    airpurity: {ID: 0x4003, type: Zcl.DataType.UINT16},
                    temperature: {ID: 0x4004, type: Zcl.DataType.INT16},
                    illuminance: {ID: 0x4005, type: Zcl.DataType.UINT16},
                    battery: {ID: 0x4006, type: Zcl.DataType.UINT16},
                    unknown3: {ID: 0x4007, type: Zcl.DataType.UINT16},
                    unknown4: {ID: 0x4008, type: Zcl.DataType.UINT16},
                    pressure: {ID: 0x4009, type: Zcl.DataType.UINT16}, // Not yet confirmed
                    unknown6: {ID: 0x400a, type: Zcl.DataType.UINT16},
                    unknown7: {ID: 0x400b, type: Zcl.DataType.UINT16},
                    unknown8: {ID: 0x400c, type: Zcl.DataType.UINT16},
                },
                commands: {},
                commandsResponse: {},
            }),
            m.deviceAddCustomCluster("twinguardOptions", {
                ID: 0xe004,
                manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                attributes: {
                    unknown1: {ID: 0x4000, type: Zcl.DataType.BITMAP8}, // 0,1 ??? read during pairing
                    pre_alarm: {ID: 0x4001, type: Zcl.DataType.BITMAP8}, // 0,1 on/off
                },
                commands: {},
                commandsResponse: {},
            }),
            m.deviceAddCustomCluster("twinguardSetup", {
                ID: 0xe006,
                manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                attributes: {
                    unknown1: {ID: 0x5003, type: Zcl.DataType.INT8}, // perhaps signal strength? -7?
                    unknown2: {ID: 0x5004, type: Zcl.DataType.UINT8}, // ????
                    heartbeat: {ID: 0x5005, type: Zcl.DataType.BITMAP8}, // 0
                },
                commands: {
                    pairingCompleted: {
                        ID: 0x01,
                        parameters: [],
                    },
                },
                commandsResponse: {},
            }),
            m.deviceAddCustomCluster("twinguardAlarm", {
                ID: 0xe007,
                manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                attributes: {
                    alarm_status: {ID: 0x5000, type: Zcl.DataType.BITMAP32},
                },
                commands: {
                    burglarAlarm: {
                        ID: 0x01,
                        parameters: [
                            {name: "data", type: Zcl.DataType.UINT8}, // data:1 trips the siren data:0 should stop the siren
                        ],
                    },
                },
                commandsResponse: {},
            }),
            boschExtend.twinguard(),
        ],
        configure: async (device, coordinatorEndpoint) => {
            await reporting.bind(device.getEndpoint(7), coordinatorEndpoint, ["genPollCtrl"]);
            await reporting.bind(device.getEndpoint(1), coordinatorEndpoint, ["genAlarms", "twinguardSmokeDetector", "twinguardOptions"]);
            await reporting.bind(device.getEndpoint(3), coordinatorEndpoint, ["twinguardMeasurements"]);
            await reporting.bind(device.getEndpoint(12), coordinatorEndpoint, ["twinguardSetup", "twinguardAlarm"]);
            await device.getEndpoint(1).read("twinguardOptions", ["unknown1"], manufacturerOptions); // Needed for pairing
            await device.getEndpoint(12).command("twinguardSetup", "pairingCompleted", manufacturerOptions); // Needed for pairing
            await device.getEndpoint(1).write("twinguardSmokeDetector", {sensitivity: 0x0002}, manufacturerOptions); // Setting defaults
            await device.getEndpoint(1).write("twinguardOptions", {pre_alarm: 0x01}, manufacturerOptions); // Setting defaults
            await device.getEndpoint(12).write("twinguardSetup", {heartbeat: 0x01}, manufacturerOptions); // Setting defaults
            await device.getEndpoint(1).read("twinguardSmokeDetector", ["sensitivity"], manufacturerOptions);
            await device.getEndpoint(1).read("twinguardOptions", ["pre_alarm"], manufacturerOptions);
            await device.getEndpoint(12).read("twinguardSetup", ["heartbeat"], manufacturerOptions);
        },
    },
    {
        zigbeeModel: ["RFPR-ZB-SH-EU"],
        model: "RFPR-ZB-SH-EU",
        vendor: "Bosch",
        description: "Wireless motion detector",
        fromZigbee: [fz.temperature, fz.battery, fz.ias_occupancy_alarm_1],
        toZigbee: [],
        meta: {battery: {voltageToPercentage: {min: 2500, max: 3000}}},
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, ["msTemperatureMeasurement", "genPowerCfg"]);
            await reporting.temperature(endpoint);
            await reporting.batteryVoltage(endpoint);
        },
        exposes: [e.temperature(), e.battery(), e.occupancy(), e.battery_low(), e.tamper()],
    },
    {
        zigbeeModel: ["RBSH-SP-ZB-EU", "RBSH-SP-ZB-FR", "RBSH-SP-ZB-GB"],
        model: "BSP-FZ2",
        vendor: "Bosch",
        description: "Plug compact EU",
        extend: [m.onOff(), m.electricityMeter({voltage: false, current: false})],
        ota: true,
        whiteLabel: [
            {vendor: "Bosch", model: "BSP-EZ2", description: "Plug compact FR", fingerprint: [{modelID: "RBSH-SP-ZB-FR"}]},
            {vendor: "Bosch", model: "BSP-GZ2", description: "Plug compact UK", fingerprint: [{modelID: "RBSH-SP-ZB-GB"}]},
        ],
    },
    {
        zigbeeModel: ["RBSH-SWD-ZB", "RBSH-SWD2-ZB"],
        model: "BSEN-C2",
        vendor: "Bosch",
        description: "Door/window contact II",
        extend: [
            boschExtend.doorWindowContact(false),
            m.battery({
                percentage: true,
                lowStatus: true,
            }),
            m.bindCluster({
                cluster: "genPollCtrl",
                clusterType: "input",
            }),
        ],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await endpoint.read("genPowerCfg", ["batteryPercentageRemaining"]);
            await endpoint.read("ssIasZone", ["zoneStatus"]);
        },
    },
    {
        zigbeeModel: ["RBSH-SWDV-ZB"],
        model: "BSEN-CV",
        vendor: "Bosch",
        description: "Door/window contact II plus",
        extend: [
            boschExtend.doorWindowContact(true),
            m.battery({
                percentage: true,
                lowStatus: true,
            }),
            m.bindCluster({
                cluster: "genPollCtrl",
                clusterType: "input",
            }),
        ],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await endpoint.read("genPowerCfg", ["batteryPercentageRemaining"]);
            await endpoint.read("ssIasZone", ["zoneStatus"]);
        },
    },
    {
        zigbeeModel: ["RBSH-MMD-ZB-EU"],
        model: "BMCT-DZ",
        vendor: "Bosch",
        description: "Phase-cut dimmer",
        extend: [m.identify(), m.light({configureReporting: true, effect: false})],
    },
    {
        zigbeeModel: ["RBSH-MMR-ZB-EU"],
        model: "BMCT-RZ",
        vendor: "Bosch",
        description: "Relay, potential free",
        extend: [m.onOff({powerOnBehavior: false})],
    },
    {
        zigbeeModel: ["RBSH-MMS-ZB-EU"],
        model: "BMCT-SLZ",
        vendor: "Bosch",
        description: "Light/shutter control unit II",
        extend: [
            m.deviceEndpoints({endpoints: {left: 2, right: 3}}),
            m.electricityMeter({voltage: false, current: false}),
            m.deviceAddCustomCluster("boschSpecific", {
                ID: 0xfca0,
                manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                attributes: {
                    deviceMode: {ID: 0x0000, type: Zcl.DataType.ENUM8},
                    switchType: {ID: 0x0001, type: Zcl.DataType.ENUM8},
                    calibrationOpeningTime: {ID: 0x0002, type: Zcl.DataType.UINT32},
                    calibrationClosingTime: {ID: 0x0003, type: Zcl.DataType.UINT32},
                    calibrationButtonHoldTime: {ID: 0x0005, type: Zcl.DataType.UINT8},
                    childLock: {ID: 0x0008, type: Zcl.DataType.BOOLEAN},
                    calibrationMotorStartDelay: {ID: 0x000f, type: Zcl.DataType.UINT8},
                    motorState: {ID: 0x0013, type: Zcl.DataType.ENUM8},
                },
                commands: {},
                commandsResponse: {},
            }),
            boschExtend.bmct(),
        ],
        ota: true,
        configure: async (device, coordinatorEndpoint) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, ["genIdentify", "closuresWindowCovering", "boschSpecific"]);
            await reporting.currentPositionLiftPercentage(endpoint1);
            await endpoint1.read("boschSpecific", [
                "deviceMode",
                "switchType",
                "motorState",
                "childLock",
                "calibrationOpeningTime",
                "calibrationClosingTime",
                "calibrationButtonHoldTime",
                "calibrationMotorStartDelay",
            ]);
            const endpoint2 = device.getEndpoint(2);
            await endpoint2.read("boschSpecific", ["childLock"]);
            await reporting.bind(endpoint2, coordinatorEndpoint, ["genIdentify", "genOnOff"]);
            await reporting.onOff(endpoint2);
            const endpoint3 = device.getEndpoint(3);
            await endpoint3.read("boschSpecific", ["childLock"]);
            await reporting.bind(endpoint3, coordinatorEndpoint, ["genIdentify", "genOnOff"]);
            await reporting.onOff(endpoint3);
        },
        exposes: (device, options) => {
            const stateDeviceMode: KeyValue = {
                light: 0x04,
                shutter: 0x01,
                disabled: 0x00,
            };
            const stateMotor: KeyValue = {
                stopped: 0x00,
                opening: 0x01,
                closing: 0x02,
            };
            const stateSwitchType: KeyValue = {
                button: 0x01,
                button_key_change: 0x02,
                rocker_switch: 0x03,
                rocker_switch_key_change: 0x04,
            };
            const commonExposes = [
                e.enum("switch_type", ea.ALL, Object.keys(stateSwitchType)).withDescription("Module controlled by a rocker switch or a button"),
            ];
            const lightExposes = [
                e.switch().withEndpoint("left"),
                e.switch().withEndpoint("right"),
                e.power_on_behavior().withEndpoint("left"),
                e.power_on_behavior().withEndpoint("right"),
                e.binary("child_lock", ea.ALL, "ON", "OFF").withEndpoint("left").withDescription("Enable/Disable child lock"),
                e.binary("child_lock", ea.ALL, "ON", "OFF").withEndpoint("right").withDescription("Enable/Disable child lock"),
            ];
            const coverExposes = [
                e.cover_position(),
                e.enum("motor_state", ea.STATE, Object.keys(stateMotor)).withDescription("Current shutter motor state"),
                e.binary("child_lock", ea.ALL, "ON", "OFF").withDescription("Enable/Disable child lock"),
                e
                    .numeric("calibration_closing_time", ea.ALL)
                    .withUnit("s")
                    .withDescription("Calibrate shutter closing time")
                    .withValueMin(1)
                    .withValueMax(90)
                    .withValueStep(0.1),
                e
                    .numeric("calibration_opening_time", ea.ALL)
                    .withUnit("s")
                    .withDescription("Calibrate shutter opening time")
                    .withValueMin(1)
                    .withValueMax(90)
                    .withValueStep(0.1),
                e
                    .numeric("calibration_button_hold_time", ea.ALL)
                    .withUnit("s")
                    .withDescription("Time to hold for long press")
                    .withValueMin(0.1)
                    .withValueMax(2)
                    .withValueStep(0.1),
                e
                    .numeric("calibration_motor_start_delay", ea.ALL)
                    .withUnit("s")
                    .withDescription("Delay between command and motor start")
                    .withValueMin(0)
                    .withValueMax(20)
                    .withValueStep(0.1),
            ];

            if (!utils.isDummyDevice(device)) {
                const deviceModeKey = device.getEndpoint(1).getClusterAttributeValue("boschSpecific", "deviceMode");
                const deviceMode = Object.keys(stateDeviceMode).find((key) => stateDeviceMode[key] === deviceModeKey);

                if (deviceMode === "light") {
                    return [...commonExposes, ...lightExposes];
                }
                if (deviceMode === "shutter") {
                    return [...commonExposes, ...coverExposes];
                }
            }
            return [e.enum("device_mode", ea.ALL, Object.keys(stateDeviceMode)).withDescription("Device mode")];
        },
    },
    {
        zigbeeModel: ["RBSH-US4BTN-ZB-EU"],
        model: "BHI-US",
        vendor: "Bosch",
        description: "Universal Switch II",
        fromZigbee: [fzLocal.bhius_button_press, fzLocal.bhius_config, fz.battery],
        toZigbee: [tzLocal.bhius_config],
        exposes: [
            e.battery_low(),
            e.battery_voltage(),
            e
                .text("config_led_top_left_press", ea.ALL)
                .withLabel("LED config (top left short press)")
                .withDescription(labelShortPress)
                .withCategory("config"),
            e
                .text("config_led_top_right_press", ea.ALL)
                .withLabel("LED config (top right short press)")
                .withDescription(labelShortPress)
                .withCategory("config"),
            e
                .text("config_led_bottom_left_press", ea.ALL)
                .withLabel("LED config (bottom left short press)")
                .withDescription(labelShortPress)
                .withCategory("config"),
            e
                .text("config_led_bottom_right_press", ea.ALL)
                .withLabel("LED config (bottom right short press)")
                .withDescription(labelShortPress)
                .withCategory("config"),
            e
                .text("config_led_top_left_longpress", ea.ALL)
                .withLabel("LED config (top left long press)")
                .withDescription(labelLongPress)
                .withCategory("config"),
            e
                .text("config_led_top_right_longpress", ea.ALL)
                .withLabel("LED config (top right long press)")
                .withDescription(labelLongPress)
                .withCategory("config"),
            e
                .text("config_led_bottom_left_longpress", ea.ALL)
                .withLabel("LED config (bottom left long press)")
                .withDescription(labelLongPress)
                .withCategory("config"),
            e
                .text("config_led_bottom_right_longpress", ea.ALL)
                .withLabel("LED config (bottom right long press)")
                .withDescription(labelLongPress)
                .withCategory("config"),
            e.action([
                "button_top_left_release",
                "button_top_right_release",
                "button_bottom_left_release",
                "button_bottom_right_release",
                "button_top_left_longpress",
                "button_top_right_longpress",
                "button_bottom_left_longpress",
                "button_bottom_right_longpress",
                "button_top_left_longpress_release",
                "button_top_right_longpress_release",
                "button_bottom_left_longpress_release",
                "button_bottom_right_longpress_release",
            ]),
        ],
        extend: [
            m.deviceAddCustomCluster("boschSpecific", {
                ID: 0xfca1,
                manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                attributes: {},
                commands: {
                    confirmButtonPressed: {
                        ID: 0x0010,
                        parameters: [{name: "data", type: Zcl.BuffaloZclDataType.BUFFER}],
                    },
                    pairingCompleted: {
                        ID: 0x0012,
                        parameters: [{name: "data", type: Zcl.BuffaloZclDataType.BUFFER}],
                    },
                },
                commandsResponse: {},
            }),
        ],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);

            // Read default LED configuration
            await endpoint
                .read("boschSpecific", [0x0010, 0x0011, 0x0012, 0x0013], {...manufacturerOptions, sendPolicy: "immediate"})
                .catch((error) => {});
            await endpoint
                .read("boschSpecific", [0x0020, 0x0021, 0x0022, 0x0023], {...manufacturerOptions, sendPolicy: "immediate"})
                .catch((error) => {});

            // We also have to read this one. Value reads 0x0f, looks like a bitmap
            await endpoint.read("boschSpecific", [0x0024], {...manufacturerOptions, sendPolicy: "immediate"});

            await endpoint.command("boschSpecific", "pairingCompleted", {data: Buffer.from([0x00])}, {sendPolicy: "immediate"});

            await reporting.bind(endpoint, coordinatorEndpoint, ["genPowerCfg", "genBasic", "boschSpecific"]);
            await reporting.batteryPercentageRemaining(endpoint);
            await reporting.batteryVoltage(endpoint);
        },
    },
];
