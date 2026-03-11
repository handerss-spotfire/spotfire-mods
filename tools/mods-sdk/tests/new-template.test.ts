import { describe, expect, test } from "@jest/globals";
import { existsSync, readFileSync, rmSync } from "fs";
import path from "path";
import { createGitIgnore, createTemplate, modIdToName, toModId } from "../src/new-template";
import { ModType } from "../src/utils";
import { setupProject } from "./test-utils";

describe("new-template", () => {
    test("action mod starter can be created", async () => {
        const projectFolder = "tests/testprojects/new-action-mod";
        await setupProject(projectFolder, ModType.Action);

        const manifest = path.join(projectFolder, "mod-manifest.json");
        const manifestJson = JSON.parse(readFileSync(manifest, "utf-8"));
        expect(manifestJson["type"]).toEqual("action");
        expect(manifestJson["name"]).toEqual("New Action Mod");
        expect(manifestJson["id"]).toEqual("new-action-mod");

        await createGitIgnore({
            targetFolder: path.resolve(projectFolder),
            quiet: true,
        });
        expect(existsSync(path.join(projectFolder, ".gitignore"))).toBeTruthy();
    });

    test("visualization mod starter can be created", async () => {
        const projectFolder = "tests/testprojects/new-visualization-mod";
        await setupProject(projectFolder, ModType.Visualization);

        const manifest = path.join(projectFolder, "mod-manifest.json");
        const manifestJson = JSON.parse(readFileSync(manifest, "utf-8"));
        expect(manifestJson["apiVersion"]).toEqual("1.3");
        expect(manifestJson["type"]).toBeUndefined();
        expect(manifestJson["name"]).toEqual("New Visualization Mod");
        expect(manifestJson["id"]).toEqual("new-visualization-mod");
        expect(manifestJson["type"]).toBeUndefined();

        await createGitIgnore({
            targetFolder: path.resolve(projectFolder),
            quiet: true,
        });
        expect(existsSync(path.join(projectFolder, ".gitignore"))).toBeTruthy();
    });

    test("package mod starter can be created", async () => {
        const projectFolder = "tests/testprojects/new-package-mod";
        await setupProject(projectFolder, ModType.Package);

        const manifest = path.join(projectFolder, "mod-manifest.json");
        const manifestJson = JSON.parse(readFileSync(manifest, "utf-8"));
        expect(manifestJson["type"]).toEqual("package");
        expect(manifestJson["apiVersion"]).toEqual("2.5");
        expect(manifestJson["name"]).toEqual("New Package Mod");
        expect(manifestJson["id"]).toEqual("new-package-mod");
        expect(manifestJson["mods"]).toEqual([
            "actions/mod-manifest.json",
            "visualizations/mod-manifest.json",
        ]);

        // Sub-mod manifests exist and have matching apiVersion
        const actionManifest = path.join(
            projectFolder,
            "actions",
            "mod-manifest.json"
        );
        const actionManifestJson = JSON.parse(
            readFileSync(actionManifest, "utf-8")
        );
        expect(actionManifestJson["apiVersion"]).toEqual("2.5");
        expect(actionManifestJson["type"]).toEqual("action");

        const vizManifest = path.join(
            projectFolder,
            "visualizations",
            "mod-manifest.json"
        );
        const vizManifestJson = JSON.parse(
            readFileSync(vizManifest, "utf-8")
        );
        expect(vizManifestJson["apiVersion"]).toEqual("2.5");
        expect(vizManifestJson["type"]).toEqual("visualization");

        // Sub-mod source files exist
        expect(
            existsSync(
                path.join(projectFolder, "actions", "src", "scripts", "my-script.ts")
            )
        ).toBeTruthy();
        expect(
            existsSync(
                path.join(projectFolder, "visualizations", "src", "main.ts")
            )
        ).toBeTruthy();
    });

    test("package mod rejects apiVersion below 2.5", async () => {
        const projectFolder = "tests/testprojects/package-mod-low-version";
        if (existsSync(projectFolder)) {
            rmSync(projectFolder, { force: true, recursive: true });
        }

        await expect(
            createTemplate(ModType.Package, {
                outDir: projectFolder,
                apiVersion: "2.0",
                quiet: true,
            })
        ).rejects.toThrow("Package mods require apiVersion 2.5 or later");
    });

    test("package mod accepts higher apiVersion", async () => {
        const projectFolder = "tests/testprojects/package-mod-3.0";
        await setupProject(projectFolder, ModType.Package, "3.0");

        const manifest = path.join(projectFolder, "mod-manifest.json");
        const manifestJson = JSON.parse(readFileSync(manifest, "utf-8"));
        expect(manifestJson["apiVersion"]).toEqual("3.0");

        const actionManifest = path.join(
            projectFolder,
            "actions",
            "mod-manifest.json"
        );
        const actionManifestJson = JSON.parse(
            readFileSync(actionManifest, "utf-8")
        );
        expect(actionManifestJson["apiVersion"]).toEqual("3.0");
    });
});

describe("can create project with different api version", () => {
    test("action mod", async () => {
        const projectFolder = "tests/testprojects/action-mod-2.1";
        await setupProject(projectFolder, ModType.Action, "2.1");

        const manifest = path.join(projectFolder, "mod-manifest.json");
        const manifestJson = JSON.parse(readFileSync(manifest, "utf-8"));
        expect(manifestJson["apiVersion"]).toEqual("2.1");
        expect(manifestJson["type"]).toEqual("action");

        const packageJsonPath = path.join(projectFolder, "package.json");
        const packageJson = JSON.parse(
            readFileSync(packageJsonPath, "utf-8")
        );
        expect(
            packageJson["devDependencies"]["@spotfire/mods-api"]
        ).toEqual("~2.1.0");
    });

    test("visualization mod", async () => {
        const projectFolder = "tests/testprojects/visualization-mod-2.1";
        await setupProject(projectFolder, ModType.Visualization, "2.1");

        const manifest = path.join(projectFolder, "mod-manifest.json");
        const manifestJson = JSON.parse(readFileSync(manifest, "utf-8"));
        expect(manifestJson["apiVersion"]).toEqual("2.1");
        expect(manifestJson["type"]).toEqual("visualization");

        const packageJsonPath = path.join(projectFolder, "package.json");
        const packageJson = JSON.parse(
            readFileSync(packageJsonPath, "utf-8")
        );
        expect(
            packageJson["devDependencies"]["@spotfire/mods-api"]
        ).toEqual("~2.1.0");
    });
});

describe("--name flag", () => {
    test("uses provided name instead of folder name", async () => {
        const projectFolder = "tests/testprojects/new-action-mod";
        if (existsSync(projectFolder)) {
            rmSync(projectFolder, { force: true, recursive: true });
        }

        await createTemplate(ModType.Action, {
            outDir: projectFolder,
            name: "My Custom Action",
            quiet: true,
        });

        const manifest = path.join(projectFolder, "mod-manifest.json");
        const manifestJson = JSON.parse(readFileSync(manifest, "utf-8"));
        expect(manifestJson["name"]).toEqual("My Custom Action");
        expect(manifestJson["id"]).toEqual("my-custom-action");
    });

    test("falls back to folder name when --name is not provided", async () => {
        const projectFolder = "tests/testprojects/new-action-mod";
        if (existsSync(projectFolder)) {
            rmSync(projectFolder, { force: true, recursive: true });
        }

        await createTemplate(ModType.Action, {
            outDir: projectFolder,
            quiet: true,
        });

        const manifest = path.join(projectFolder, "mod-manifest.json");
        const manifestJson = JSON.parse(readFileSync(manifest, "utf-8"));
        expect(manifestJson["name"]).toEqual("New Action Mod");
        expect(manifestJson["id"]).toEqual("new-action-mod");
    });
});

describe("toModId", () => {
    const tests = [
        [
            "removes spaces",
            "My    mod   with many     spaces    ",
            "my-mod-with-many-spaces",
        ],
        ["removes invalid characters", "My mod @$! path", "my-mod-path"],
    ];

    for (const testCase of tests) {
        test(testCase[0], () => {
            const modId = toModId(testCase[1]);
            expect(modId).toEqual(testCase[2]);
        });
    }
});

describe("modIdToName", () => {
    const tests = [
        ["capitalizes before separators", "my-awesome-mod", "My Awesome Mod"],
    ];

    for (const testCase of tests) {
        test(testCase[0], () => {
            const modId = modIdToName(testCase[1]);
            expect(modId).toEqual(testCase[2]);
        });
    }
});
