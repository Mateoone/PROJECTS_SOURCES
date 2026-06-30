#!/usr/bin/env node
// Generates dist/UnrealBridge.streamDeckProfile — 5 buttons mapped to the StreamDeckDemo
// actions (Color/Scale/Spin/Reset), pre-configured (host/port/action/payload/title).
//
// Format = Stream Deck 7.x (reverse-engineered from a real 7.5 export). Zip layout:
//   package.json                                          (FormatVersion 1 + RequiredPlugins)
//   Profiles/<outerUUID>.sdProfile/manifest.json          (bundle, Version 3.0, Device, Pages)
//   Profiles/<outerUUID>.sdProfile/Profiles/<pageUUID>/manifest.json   (Keypad Actions)
//   Profiles/<outerUUID>.sdProfile/Profiles/<defaultUUID>/manifest.json (empty default page)
//
// NOTE: custom per-key images are NOT baked in (the export had none to learn the encoding).
// Keys show the plugin's default action icon; they are differentiated by their titles.
//
// Usage:  node tools/make_profile.js

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const BUILD = path.join(require("os").tmpdir(), `sdprofile_build_${process.pid}`);

// --- environment metadata, taken from the user's working 7.5 export ---
const ENV = {
	AppVersion: "7.5.0.22885",
	DeviceModel: "20GBA9901", // Stream Deck MK.2
	DeviceUUID: "833c22d1-bdb2-487f-a150-090548977a6f", // user's hardware instance
	OSType: "macOS",
	OSVersion: "26.5.1",
};
const PLUGIN = { Name: "Unreal Bridge", UUID: "dev.mip.unreal", Version: "0.1.0.0" };
const ACTION_UUID = "dev.mip.unreal.trigger";

const uuid = () => crypto.randomUUID(); // lowercase, as in the export
const outerUUID = uuid().toUpperCase();
const pageUUID = uuid().toUpperCase();
const defaultUUID = uuid().toUpperCase();

const keys = [
	{ col: 0, action: "Color", payload: '{"r":1,"g":0,"b":0}', title: "Red" },
	{ col: 1, action: "Color", payload: '{"r":0,"g":0.4,"b":1}', title: "Blue" },
	{ col: 2, action: "Scale", payload: '{"value":2.0}', title: "Scale x2" },
	{ col: 3, action: "Spin", payload: "", title: "Spin" },
	{ col: 4, action: "Reset", payload: "", title: "Reset" },
];

const mkAction = (k) => ({
	ActionID: uuid(),
	LinkedTitle: true,
	Name: "Trigger UE Event",
	Plugin: PLUGIN,
	Resources: null,
	Settings: { action: k.action, host: "127.0.0.1", payload: k.payload, port: "5051", title: k.title },
	State: 0,
	States: [
		{
			FontFamily: "",
			FontSize: 12,
			FontStyle: "",
			FontUnderline: false,
			OutlineThickness: 2,
			ShowTitle: true,
			Title: k.title,
			TitleAlignment: "bottom",
			TitleColor: "#ffffff",
		},
	],
	UUID: ACTION_UUID,
});

// --- build tree ---
fs.rmSync(BUILD, { recursive: true, force: true });
const sdProfileDir = path.join(BUILD, "Profiles", `${outerUUID}.sdProfile`);
const pageDir = path.join(sdProfileDir, "Profiles", pageUUID);
const defaultDir = path.join(sdProfileDir, "Profiles", defaultUUID);
fs.mkdirSync(pageDir, { recursive: true });
fs.mkdirSync(defaultDir, { recursive: true });

// root package.json
fs.writeFileSync(
	path.join(BUILD, "package.json"),
	JSON.stringify({
		AppVersion: ENV.AppVersion,
		DeviceModel: ENV.DeviceModel,
		DeviceSettings: null,
		FormatVersion: 1,
		OSType: ENV.OSType,
		OSVersion: ENV.OSVersion,
		RequiredPlugins: [PLUGIN.UUID],
	})
);

// bundle manifest
fs.writeFileSync(
	path.join(sdProfileDir, "manifest.json"),
	JSON.stringify({
		Device: { Model: ENV.DeviceModel, UUID: ENV.DeviceUUID },
		Name: "Unreal Bridge",
		Pages: {
			Current: "00000000-0000-0000-0000-000000000000",
			Default: defaultUUID.toLowerCase(),
			Pages: [pageUUID.toLowerCase()],
		},
		Version: "3.0",
	})
);

// action page
const actions = {};
for (const k of keys) actions[`${k.col},0`] = mkAction(k);
fs.writeFileSync(path.join(pageDir, "manifest.json"), JSON.stringify({ Controllers: [{ Actions: actions, Type: "Keypad" }], Icon: "", Name: "" }));

// empty default page
fs.writeFileSync(path.join(defaultDir, "manifest.json"), JSON.stringify({ Controllers: [{ Actions: null, Type: "Keypad" }], Icon: "", Name: "" }));

// --- zip (root entries = package.json + Profiles/) ---
fs.mkdirSync(DIST, { recursive: true });
const out = path.join(DIST, "UnrealBridge.streamDeckProfile");
fs.rmSync(out, { force: true });
execSync(`cd "${BUILD}" && zip -rqX "${out}" package.json Profiles -x "*/.DS_Store"`);
fs.rmSync(BUILD, { recursive: true, force: true });

console.log(`Built ${out}`);
console.log(`  device ${ENV.DeviceModel} | outer ${outerUUID}`);
console.log(`  pages: actions=${pageUUID.toLowerCase()} default=${defaultUUID.toLowerCase()}`);
