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
        expect(manifestJson["mods"]).toEqual([]);
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

describe("--package-manifest flag", () => {
    const packageProject = "tests/testprojects/package-for-new";

    async function setupPackageProject() {
        if (existsSync(packageProject)) {
            rmSync(packageProject, { force: true, recursive: true });
        }
        await createTemplate(ModType.Package, {
            outDir: packageProject,
            quiet: true,
        });
    }

    test("creates action mod inside package actions folder", async () => {
        await setupPackageProject();
        const pkgManifestPath = path.join(packageProject, "mod-manifest.json");

        await createTemplate(ModType.Action, {
            outDir: ".",
            name: "My New Action",
            packageManifest: pkgManifestPath,
            quiet: true,
        });

        const newModDir = path.join(packageProject, "actions", "my-new-action");
        expect(existsSync(newModDir)).toBeTruthy();

        const modManifest = path.join(newModDir, "mod-manifest.json");
        const modManifestJson = JSON.parse(readFileSync(modManifest, "utf-8"));
        expect(modManifestJson["type"]).toEqual("action");
        expect(modManifestJson["name"]).toEqual("My New Action");
        expect(modManifestJson["id"]).toEqual("my-new-action");

        // Should not have its own package.json
        expect(existsSync(path.join(newModDir, "package.json"))).toBeFalsy();

        // Source files should exist
        expect(
            existsSync(path.join(newModDir, "src", "scripts", "my-script.ts"))
        ).toBeTruthy();
    });

    test("creates visualization mod inside package visualizations folder", async () => {
        await setupPackageProject();
        const pkgManifestPath = path.join(packageProject, "mod-manifest.json");

        await createTemplate(ModType.Visualization, {
            outDir: ".",
            name: "My New Viz",
            packageManifest: pkgManifestPath,
            quiet: true,
        });

        const newModDir = path.join(
            packageProject,
            "visualizations",
            "my-new-viz"
        );
        expect(existsSync(newModDir)).toBeTruthy();

        const modManifest = path.join(newModDir, "mod-manifest.json");
        const modManifestJson = JSON.parse(readFileSync(modManifest, "utf-8"));
        expect(modManifestJson["type"]).toEqual("visualization");

        // Should not have its own package.json
        expect(existsSync(path.join(newModDir, "package.json"))).toBeFalsy();
    });

    test("registers new mod in package manifest mods array", async () => {
        await setupPackageProject();
        const pkgManifestPath = path.join(packageProject, "mod-manifest.json");

        await createTemplate(ModType.Action, {
            outDir: ".",
            name: "Extra Action",
            packageManifest: pkgManifestPath,
            quiet: true,
        });

        const pkgManifest = JSON.parse(
            readFileSync(pkgManifestPath, "utf-8")
        );
        expect(pkgManifest["mods"]).toContain(
            "actions/extra-action/mod-manifest.json"
        );
    });

    test("adds reference to package tsconfig.json for new action", async () => {
        await setupPackageProject();
        const pkgManifestPath = path.join(packageProject, "mod-manifest.json");

        await createTemplate(ModType.Action, {
            outDir: ".",
            name: "Tsconfig Action",
            packageManifest: pkgManifestPath,
            quiet: true,
        });

        const tsconfigPath = path.join(packageProject, "tsconfig.json");
        const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf-8"));
        expect(tsconfig.references).toContainEqual({
            path: "actions/tsconfig-action",
        });
    });

    test("adds reference to package tsconfig.json for new visualization", async () => {
        await setupPackageProject();
        const pkgManifestPath = path.join(packageProject, "mod-manifest.json");

        await createTemplate(ModType.Visualization, {
            outDir: ".",
            name: "Tsconfig Viz",
            packageManifest: pkgManifestPath,
            quiet: true,
        });

        const tsconfigPath = path.join(packageProject, "tsconfig.json");
        const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf-8"));
        expect(tsconfig.references).toContainEqual({
            path: "visualizations/tsconfig-viz",
        });
    });

    test("adds composite true to sub-mod tsconfig.json", async () => {
        await setupPackageProject();
        const pkgManifestPath = path.join(packageProject, "mod-manifest.json");

        await createTemplate(ModType.Action, {
            outDir: ".",
            name: "Composite Action",
            packageManifest: pkgManifestPath,
            quiet: true,
        });

        const subTsconfigPath = path.join(
            packageProject,
            "actions",
            "composite-action",
            "tsconfig.json"
        );
        const subTsconfig = JSON.parse(readFileSync(subTsconfigPath, "utf-8"));
        expect(subTsconfig.compilerOptions.composite).toBe(true);
    });

    test("requires --name when creating inside a package in quiet mode", async () => {
        await setupPackageProject();
        const pkgManifestPath = path.join(packageProject, "mod-manifest.json");

        await expect(
            createTemplate(ModType.Action, {
                outDir: ".",
                packageManifest: pkgManifestPath,
                quiet: true,
            })
        ).rejects.toThrow("--name is required");
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
