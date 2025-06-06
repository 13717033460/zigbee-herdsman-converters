import {Zcl} from "zigbee-herdsman";

import * as fz from "../converters/fromZigbee";
import * as tz from "../converters/toZigbee";
import * as constants from "../lib/constants";
import * as exposes from "../lib/exposes";
import * as reporting from "../lib/reporting";
import type {DefinitionWithExtend} from "../lib/types";

const e = exposes.presets;

export const definitions: DefinitionWithExtend[] = [
    {
        zigbeeModel: ["101.301.001649", "101.301.001838", "101.301.001802", "101.301.001738", "101.301.001412", "101.301.001765", "101.301.001814"],
        model: "MEAZON_BIZY_PLUG",
        vendor: "Meazon",
        description: "Bizy plug meter",
        fromZigbee: [fz.command_on, fz.command_off, fz.on_off, fz.meazon_meter],
        exposes: [e.switch(), e.power(), e.voltage(), e.current(), e.energy()],
        toZigbee: [tz.on_off],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(10);
            await reporting.bind(endpoint, coordinatorEndpoint, ["genOnOff", "seMetering"]);
            await reporting.onOff(endpoint, {min: 1, max: 0xfffe});
            const options = {manufacturerCode: Zcl.ManufacturerCode.MEAZON_S_A, disableDefaultResponse: false};
            await endpoint.write("seMetering", {4101: {value: 0x063e, type: 25}}, options);
            await endpoint.configureReporting(
                "seMetering",
                [
                    {
                        reportableChange: 1,
                        attribute: {ID: 0x2000, type: 0x29},
                        minimumReportInterval: 1,
                        maximumReportInterval: constants.repInterval.MINUTES_5,
                    },
                ],
                options,
            );
        },
    },
    {
        zigbeeModel: ["102.106.000235", "102.106.001111", "102.106.000348", "102.106.000256", "102.106.001242", "102.106.000540"],
        model: "MEAZON_DINRAIL",
        vendor: "Meazon",
        description: "DinRail 1-phase meter",
        fromZigbee: [fz.command_on, fz.command_off, fz.on_off, fz.meazon_meter],
        exposes: [e.switch(), e.power(), e.voltage(), e.current()],
        toZigbee: [tz.on_off],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(10);
            await reporting.bind(endpoint, coordinatorEndpoint, ["genOnOff", "seMetering"]);
            await reporting.onOff(endpoint);
            const options = {manufacturerCode: Zcl.ManufacturerCode.MEAZON_S_A, disableDefaultResponse: false};
            await endpoint.write("seMetering", {4101: {value: 0x063e, type: 25}}, options);
            await reporting.onOff(endpoint);
            await endpoint.configureReporting(
                "seMetering",
                [
                    {
                        attribute: {ID: 0x2000, type: 0x29},
                        minimumReportInterval: 1,
                        maximumReportInterval: constants.repInterval.MINUTES_5,
                        reportableChange: 1,
                    },
                ],
                options,
            );
        },
    },
];
