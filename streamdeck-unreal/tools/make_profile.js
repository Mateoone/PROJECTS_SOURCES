#!/usr/bin/env node
// Generates dist/UnrealBridge.streamDeckProfile — a Stream Deck profile that lays out
// 5 buttons mapped to the StreamDeckDemo actions (Color/Scale/Spin/Reset).
//
// Profile format = Stream Deck 6.x nested bundle:
//   <UUID>.sdProfile/manifest.json                      (bundle: Device + Pages)
//   <UUID>.sdProfile/Profiles/<pageUUID>/manifest.json  (Controllers/Actions by "col,row")
//   <UUID>.sdProfile/Profiles/<pageUUID>/bt_0X.png      (custom key images)
//
// Usage:  node tools/make_profile.js [deviceModel]
//   deviceModel defaults to 20GBA9901 (Stream Deck MK.2). Other known models:
//     20GAA9901 = Stream Deck (15 keys)   20GAT9901 = Stream Deck XL (32)
//     20GAM9901 = Stream Deck Mini (6)     20GBD9901 = Stream Deck + (8 + dials)

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const IMGS = path.join(ROOT, "streamdeck-plugin/dev.mip.unreal.sdPlugin/imgs");
const DIST = path.join(ROOT, "dist");
const BUILD = path.join(require("os").tmpdir(), `sdprofile_build_${process.pid}`);

const DEVICE_MODEL = process.argv[2] || "20GBA9901"; // Stream Deck MK.2
const ACTION_UUID = "dev.mip.unreal.trigger";

const outerUUID = crypto.randomUUID().toUpperCase();
const pageUUID = crypto.randomUUID().toUpperCase();

const keys = [
	{ col: 0, action: "Color", payload: '{"r":1,"g":0,"b":0}', title: "Red", img: "bt_01.png" },
	{ col: 1, action: "Color", payload: '{"r":0,"g":0.4,"b":1}', title: "Blue", img: "bt_02.png" },
	{ col: 2, action: "Scale", payload: '{"value":2.0}', title: "Scale x2", img: "bt_03.png" },
	{ col: 3, action: "Spin", payload: "", title: "Spin", img: "bt_04.png" },
	{ col: 4, action: "Reset", payload: "", title: "Reset", img: "bt_05.png" },
];

const mkState = (k) => ({
	Image: k.img,
	Title: k.title,
	FFamily: "", FSize: "12", FStyle: "", FUnderline: "off",
	TitleAlignment: "bottom", TitleColor: "#ffffff", TitleShow: "",
});

const mkAction = (k) => ({
	UUID: ACTION_UUID,
	Name: "Trigger UE Event",
	State: 0,
	Settings: { host: "127.0.0.1", port: "5051", action: k.action, payload: k.payload, title: k.title },
	States: [mkState(k)],
});

fs.rmSync(BUILD, { recursive: true, force: true });
const sdProfileDir = path.join(BUILD, `${outerUUID}.sdProfile`);
const pageDir = path.join(sdProfileDir, "Profiles", pageUUID);
fs.mkdirSync(pageDir, { recursive: true });

fs.writeFileSync(
	path.join(sdProfileDir, "manifest.json"),
	JSON.stringify({ Name: "Unreal Bridge", Version: "2.0", Device: { Model: DEVICE_MODEL, UUID: "" }, Pages: { Current: pageUUID, Pages: [pageUUID] } }, null, 2)
);

const actions = {};
for (const k of keys) actions[`${k.col},0`] = mkAction(k);
fs.writeFileSync(path.join(pageDir, "manifest.json"), JSON.stringify({ Controllers: [{ Type: "Keypad", Actions: actions }] }, null, 2));

for (const k of keys) fs.copyFileSync(path.join(IMGS, k.img), path.join(pageDir, k.img));

fs.mkdirSync(DIST, { recursive: true });
const out = path.join(DIST, "UnrealBridge.streamDeckProfile");
fs.rmSync(out, { force: true });
execSync(`cd "${BUILD}" && zip -rqX "${out}" "${outerUUID}.sdProfile" -x "*/.DS_Store"`);
fs.rmSync(BUILD, { recursive: true, force: true });

console.log(`Built ${out}\n  device ${DEVICE_MODEL} | outer ${outerUUID} | page ${pageUUID}`);
