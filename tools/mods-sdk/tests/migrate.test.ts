import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { migrate } from "../src/migrate";
import { getVersion, ModType, readManifest } from "../src/utils";
import { setupProject } from "./test-utils";

describe("migrate.test.ts", () => {
    const project = "tests/testprojects/migrate";
    const manifestPath = path.join(project, "mod-manifest.json");
    const packagePath = path.join(project, "package.json");
    const scriptsDir = path.join(project, "src", "scripts");
    const esbuildConfig = path.join(project, "esbuild.config.js");

    function runMigrate(apiVersion: string, quiet = true) {
        return migrate(apiVersion, {
            manifestPath,
            packagePath,
            scripts: scriptsDir,
            esbuildConfig,
            quiet,
        });
    }

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("updates the apiVersion in the manifest", async () => {
        await setupProject(project, ModType.Action);
        await runMigrate("2.6");

        const manifest = await readManifest(manifestPath);
        expect(manifest.apiVersion).toEqual("2.6");
    });

    test("removes entryPoint from scripts when migrating to 2.6", async () => {
        await setupProject(project, ModType.Action);

        const before = await readManifest(manifestPath);
        expect(before.scripts?.[0].entryPoint).toBeDefined();

        await runMigrate("2.6");

        const after = await readManifest(manifestPath);
        for (const script of after.scripts ?? []) {
            expect(script.entryPoint).toBeUndefined();
        }
    });

    test("keeps entryPoint when migrating below 2.6", async () => {
        await setupProject(project, ModType.Action);
        await runMigrate("2.4");

        const manifest = await readManifest(manifestPath);
        expect(manifest.apiVersion).toEqual("2.4");
        expect(manifest.scripts?.[0].entryPoint).toEqual("myScript");
    });

    test("updates @spotfire/mods-api in package.json", async () => {
        await setupProject(project, ModType.Action);
        await runMigrate("2.6");

        const pkg = JSON.parse(await readFile(packagePath, "utf-8"));
        expect(pkg.devDependencies["@spotfire/mods-api"]).toEqual("~2.6.0");
    });

    test("warns when migrating to a version newer than the SDK knows about", async () => {
        await setupProject(project, ModType.Action);

        const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
        await runMigrate("2.7", false);

        const warning = infoSpy.mock.calls
            .map((call) => String(call[0]))
            .find(
                (msg) =>
                    msg.includes("newer than") &&
                    msg.includes("@spotfire/mods-sdk")
            );
        expect(warning).toBeDefined();
    });

    test("bumps @spotfire/mods-sdk to the running version", async () => {
        await setupProject(project, ModType.Action);

        // Pretend the project was created with an old SDK.
        const pkg = JSON.parse(await readFile(packagePath, "utf-8"));
        pkg.devDependencies["@spotfire/mods-sdk"] = "^1.0.0";
        await writeFile(packagePath, JSON.stringify(pkg), "utf-8");

        await runMigrate("2.6");

        const updated = JSON.parse(await readFile(packagePath, "utf-8"));
        expect(updated.devDependencies["@spotfire/mods-sdk"]).toEqual(
            `^${await getVersion()}`
        );
    });

    test("warns about scripts missing RegisterEntryPoint", async () => {
        await setupProject(project, ModType.Action);
        await writeFile(
            path.join(scriptsDir, "no-entry.ts"),
            "export function noEntry() {}\n",
            "utf-8"
        );

        const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
        await runMigrate("2.6", false);

        const messages = infoSpy.mock.calls.map((call) => String(call[0]));
        const warning = messages.find(
            (msg) =>
                msg.includes("no-entry.ts") &&
                msg.includes("RegisterEntryPoint")
        );
        expect(warning).toBeDefined();
    });

    test("does not warn when every script registers an entry point", async () => {
        await setupProject(project, ModType.Action);

        const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
        await runMigrate("2.6", false);

        const registerWarnings = infoSpy.mock.calls
            .map((call) => String(call[0]))
            .filter(
                (msg) =>
                    msg.includes("does not call") &&
                    msg.includes("RegisterEntryPoint")
            );
        expect(registerWarnings).toHaveLength(0);
    });

    test("warns when the generated params interface name changes", async () => {
        await setupProject(project, ModType.Action);

        // Make the script id and entry point normalize to different names.
        const manifest = await readManifest(manifestPath);
        manifest.scripts![0].id = "weird-name";
        manifest.scripts![0].entryPoint = "differentThing";
        await writeFile(manifestPath, JSON.stringify(manifest), "utf-8");

        const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
        await runMigrate("2.6", false);

        const warning = infoSpy.mock.calls
            .map((call) => String(call[0]))
            .find(
                (msg) =>
                    msg.includes("weird-name") && msg.includes("changes from")
            );
        expect(warning).toBeDefined();
    });

    test("warns when the esbuild config overrides format for >=2.6", async () => {
        // Dedicated path so the user esbuild config is loaded fresh (not from
        // another test's ESM import cache).
        const cfgProject = "tests/testprojects/migrate-esbuild";
        const cfgManifest = path.join(cfgProject, "mod-manifest.json");
        const cfgPackage = path.join(cfgProject, "package.json");
        const cfgScripts = path.join(cfgProject, "src", "scripts");
        const cfgEsbuild = path.join(cfgProject, "esbuild.config.js");

        await setupProject(cfgProject, ModType.Action);
        await writeFile(
            cfgEsbuild,
            `export default { target: "es2022", format: "iife" };\n`,
            "utf-8"
        );

        const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
        await migrate("2.6", {
            manifestPath: cfgManifest,
            packagePath: cfgPackage,
            scripts: cfgScripts,
            esbuildConfig: cfgEsbuild,
            quiet: false,
        });

        const warning = infoSpy.mock.calls
            .map((call) => String(call[0]))
            .find(
                (msg) =>
                    msg.includes("esbuild.config.js") && msg.includes("format")
            );
        expect(warning).toBeDefined();
    });
});
