import { hostname } from "os";
import * as test from "tape";

import { ScoutConfiguration } from "../lib/types";

test("ScoutConfiguration builds with minimal passed ENV", t => {
    // This env mimics what would be passed in from process.env
    const config = ScoutConfiguration.fromEnv({
        SCOUT_APP: "app",
        SCOUT_HOSTNAME: "hostname",
        SCOUT_KEY: "key",
    });

    t.assert(config, "config was generated");
    t.equals(config.hostname, "hostname", "hostname was set");
    t.equals(config.applicationName, "app", "application name was set");
    t.equals(config.key, "key", "key was set");

    t.end();
});

// WARNING: This test must be run with some isolation or serially,
// since it touches process.env (even though it resets it)
test("ScoutConfiguration builds from process env", t => {
    // Save
    const previousValues = {
        SCOUT_APP: process.env.SCOUT_APP,
        SCOUT_HOSTNAME: process.env.SCOUT_HOSTNAME,
        SCOUT_KEY: process.env.SCOUT_KEY,
    };

    process.env.SCOUT_KEY = "key";
    process.env.SCOUT_APP = "app";
    process.env.SCOUT_HOSTNAME = "hostname";

    const config = ScoutConfiguration.fromEnv();

    t.assert(config, "config was generated");
    t.equals(config.hostname, "hostname", "hostname was set");
    t.equals(config.applicationName, "app", "application name was set");
    t.equals(config.key, "key", "key was set");

    // Reset ENV values
    if (typeof previousValues.SCOUT_KEY === "undefined") {
        delete process.env.SCOUT_KEY;
    } else {
        process.env.SCOUT_KEY = previousValues.SCOUT_KEY;
    }

    if (typeof previousValues.SCOUT_APP === "undefined") {
        delete process.env.SCOUT_APP;
    } else {
        process.env.SCOUT_APP = previousValues.SCOUT_APP;
    }

    if (typeof previousValues.SCOUT_HOSTNAME === "undefined") {
        delete process.env.SCOUT_HOSTNAME;
    } else {
        process.env.SCOUT_HOSTNAME = previousValues.SCOUT_HOSTNAME;
    }

    t.end();
});

test("ScoutConfiguration builds from Map", t => {
    const ignoredPrefixes = ["/secret", "/auth/secret"];

    const map = new Map();
    map.set("scout.applicationName", "app");
    map.set("scout.key", "key");
    map.set("scout.ignoredRoutePrefixes", ignoredPrefixes);

    const config = ScoutConfiguration.fromMapLike(map);

    t.assert(config, "config was generated");
    t.equals(config.applicationName, "app", "application name was set");
    t.equals(config.key, "key", "key was set");

    if (typeof config.ignoredRoutePrefixes === "undefined") { throw new Error("ignoredRoutePrefixes not parsed"); }
    t.equals(config.ignoredRoutePrefixes.length, ignoredPrefixes.length, "ignored prefixes are all present");
    t.assert(
        config.ignoredRoutePrefixes.every(v => ignoredPrefixes.includes(v)),
        "all ignored prefixes are present",
    );

    t.end();
});

test("ScoutConfiguration builds and overrides in the right order", t => {
    const ignoredPrefixes = ["/secret", "/auth/secret"];

    const previousKeyValue = process.env.SCOUT_KEY;

    // Set key at the process ENV level
    process.env.SCOUT_KEY = "env-key";

    // Set key at the map level
    const map = new Map();
    map.set("scout.key", "map-key");
    map.set("scout.applicationName", "map-app");

    const config = ScoutConfiguration.build(map);

    t.assert(config, "config was generated");
    t.equals(config.key, "env-key", "key was set by ENV");
    t.equals(config.applicationName, "map-app", "app was set by map");
    t.equals(config.hostname, hostname(), "hostname is the default (machine hostname)");

    process.env.SCOUT_KEY = previousKeyValue;

    t.end();
});
