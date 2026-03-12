import colors from "colors/safe.js";
import { existsSync } from "fs";
import { mkdir, readdir, cp, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import readline from "readline/promises";
import {
    Manifest,
    ModType,
    QuietOtions,
    capitalize,
    capitalizeBeforeSeparators,
    features,
    formatVersion,
    getDirname,
    getVersion,
    isModType,
    mkStdout,
    parseApiVersion,
    readManifest,
    writeManifest,
} from "./utils.js";

interface CreateTemplateOptions {
    outDir: string;
    apiVersion?: string;
    gitignore?: boolean;
    name?: string;
    packageManifest?: string;
}

export type TemplateType = ModType | "gitignore";
async function getTemplateFolder(type: TemplateType) {
    const dirname = await getDirname();
    let typeFolder: string;
    switch (type) {
        case ModType.Action:
            typeFolder = "actions";
            break;
        case ModType.Visualization:
            typeFolder = "visualizations";
            break;
        case ModType.Package:
            typeFolder = "packages";
            break;
        case "gitignore":
            typeFolder = "gitignore";
            break;
    }

    return path.resolve(dirname, "..", "templates", typeFolder);
}

export async function createTemplate(
    type: TemplateType,
    {
        outDir,
        apiVersion,
        gitignore,
        name,
        packageManifest,
        ...quiet
    }: CreateTemplateOptions & QuietOtions
) {
    // Auto-detect package manifest in cwd if not explicitly provided.
    if (!packageManifest && type !== "gitignore" && type !== ModType.Package) {
        const cwdManifestPath = path.resolve("mod-manifest.json");
        if (existsSync(cwdManifestPath)) {
            try {
                const cwdManifest = await readManifest(cwdManifestPath);
                if (cwdManifest.type === "package") {
                    packageManifest = cwdManifestPath;
                }
            } catch {
                // Ignore parse errors — not a valid manifest.
            }
        }
    }

    const targetFolder = path.resolve(outDir);

    const targetFolderExists = existsSync(targetFolder);
    if (!targetFolderExists) {
        await mkdir(targetFolder);
    }

    if (isModType(type)) {
        const template = "starter";
        await createModTemplate({
            modType: type,
            template,
            targetFolder,
            apiVersion,
            gitignore,
            name,
            packageManifest,
            ...quiet,
        });
    } else {
        await createGitIgnore({ targetFolder, ...quiet });
    }
}

export async function createGitIgnore({
    targetFolder,
    ...quiet
}: {
    targetFolder: string;
} & QuietOtions) {
    const stdout = mkStdout(quiet);
    const templatesFolder = await getTemplateFolder("gitignore");
    const source = path.join(templatesFolder, "ignorefile");
    const destination = path.join(targetFolder, ".gitignore");
    await cp(source, destination);
    stdout(`🎉 .gitignore file created at ${destination}`);
}

async function createModTemplate({
    apiVersion: _apiVersion,
    modType,
    template,
    targetFolder: _targetFolder,
    gitignore,
    name: _name,
    packageManifest,
    ...quiet
}: {
    apiVersion?: string;
    gitignore?: boolean;
    modType: ModType;
    template: string;
    targetFolder: string;
    name?: string;
    packageManifest?: string;
} & QuietOtions) {
    const stdout = mkStdout(quiet);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const templatesFolder = await getTemplateFolder(modType);

    try {
        // When creating inside a package mod, prompt for name if not provided
        // and compute the target folder inside the package.
        let targetFolder = _targetFolder;
        if (packageManifest && modType !== ModType.Package) {
            if (!_name && !quiet.quiet) {
                _name = await rl.question("Enter a name for the mod: ");
                if (!_name || _name.trim().length === 0) {
                    throw new Error(
                        "A name is required when creating a mod inside a package."
                    );
                }
            } else if (!_name) {
                throw new Error(
                    "A --name is required when creating a mod inside a package."
                );
            }

            const packageDir = path.dirname(path.resolve(packageManifest));
            const typeFolder =
                modType === ModType.Action ? "actions" : "visualizations";
            const modId = toModId(_name);
            targetFolder = path.join(packageDir, typeFolder, modId);

            if (!existsSync(targetFolder)) {
                await mkdir(targetFolder, { recursive: true });
            }
        }

        const starterTemplate = path.resolve(templatesFolder, template);
        const cwd = path.resolve(".");

        const files = await readdir(targetFolder);
        if (files.length > 0 && !quiet.quiet) {
            const wantToContinue = await ask(
                rl,
                "❓ The target folder is not empty. Are you sure you want to continue?"
            );
            if (!wantToContinue) {
                return;
            }
        }

        stdout(`🚧 Creating ${modType} Mods project in ${targetFolder}...`);

        try {
            await cp(starterTemplate, targetFolder, { recursive: true });
        } catch (e) {
            throw new Error(
                `Could not copy templates folder to '${targetFolder}'.\nError: ${JSON.stringify(
                    e
                )}`
            );
        }

        let defaultApiVersion: string;
        if (packageManifest && modType !== ModType.Package && !_apiVersion) {
            const pkgManifest = await readManifest(
                path.resolve(packageManifest)
            );
            defaultApiVersion =
                pkgManifest.apiVersion ?? formatVersion(features.PackageMods);
        } else if (modType === ModType.Package) {
            defaultApiVersion = formatVersion(features.PackageMods);
        } else if (modType === ModType.Action) {
            defaultApiVersion = "2.0";
        } else {
            defaultApiVersion = "1.3";
        }
        const apiVersion = parseApiVersion(_apiVersion ?? defaultApiVersion);
        if (apiVersion.status === "error") {
            throw new Error(
                `Unregonized API version, error: ${apiVersion.error}`
            );
        }

        if (
            modType === ModType.Package &&
            !apiVersion.result.supportsFeature("PackageMods")
        ) {
            throw new Error(
                `Package mods require apiVersion ${formatVersion(
                    features.PackageMods
                )} or later, was '${apiVersion.result.toManifest()}'.`
            );
        }

        const version = await getVersion();
        const packageJsonpath = path.resolve(targetFolder, "package.json");

        // When creating inside a package, remove files that belong at the package root.
        if (packageManifest && modType !== ModType.Package) {
            if (existsSync(packageJsonpath)) {
                await rm(packageJsonpath);
            }
            const vscodeDir = path.join(targetFolder, ".vscode");
            if (existsSync(vscodeDir)) {
                await rm(vscodeDir, { recursive: true });
            }
        } else {
            const packageJson = await readFile(packageJsonpath, {
                encoding: "utf8",
            });
            await writeFile(
                packageJsonpath,
                packageJson
                    .replace("MODS-SDK-VERSION", version)
                    .replace("MODS-API-VERSION", apiVersion.result.toPackage()),
                { encoding: "utf-8" }
            );
        }

        const modFolderName = path.basename(targetFolder);
        const modId = toModId(_name ?? modFolderName);
        const modName = modIdToName(modId);
        const manifestPath = path.join(targetFolder, "mod-manifest.json");
        await replaceInFile(manifestPath, (manifestTemplate) => {
            let manifestJson = manifestTemplate;
            if (!apiVersion.result.supportsFeature("ModType")) {
                manifestJson = manifestJson.replace(
                    `"type": "visualization",`,
                    ""
                );
            }

            return manifestJson
                .replace("$MOD-NAME", modName)
                .replace("$MOD-ID", modId)
                .replace("$MOD-API-VERSION", apiVersion.result.toManifest());
        });

        if (modType === ModType.Package) {
            const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
            for (const subManifestRelPath of manifest.mods ?? []) {
                const subManifestPath = path.join(
                    targetFolder,
                    subManifestRelPath
                );
                await replaceInFile(subManifestPath, (content) =>
                    content.replace(
                        "$MOD-API-VERSION",
                        apiVersion.result.toManifest()
                    )
                );
            }
        }

        // Register the new mod in the package manifest's "mods" array.
        if (packageManifest && modType !== ModType.Package) {
            const absPackageManifest = path.resolve(packageManifest);
            const pkgManifest = await readManifest(absPackageManifest);
            const packageDir = path.dirname(absPackageManifest);
            const newModManifestRel = path
                .relative(packageDir, manifestPath)
                .replace(/\\/g, "/");

            if (!pkgManifest.mods) {
                pkgManifest.mods = [];
            }

            if (!pkgManifest.mods.includes(newModManifestRel)) {
                pkgManifest.mods.push(newModManifestRel);
                await writeManifest(
                    absPackageManifest,
                    pkgManifest,
                    quiet.quiet
                );
                stdout(
                    `📦 Registered '${newModManifestRel}' in package manifest.`
                );
            }

            // Update package tsconfig.json references and sub-mod tsconfig.json.
            const pkgTsconfigPath = path.join(packageDir, "tsconfig.json");
            if (existsSync(pkgTsconfigPath)) {
                const newModDirRel = path
                    .relative(packageDir, targetFolder)
                    .replace(/\\/g, "/");

                const pkgTsconfig = JSON.parse(
                    await readFile(pkgTsconfigPath, "utf-8")
                );
                if (Array.isArray(pkgTsconfig.references)) {
                    const alreadyReferenced = pkgTsconfig.references.some(
                        (ref: { path: string }) => ref.path === newModDirRel
                    );
                    if (!alreadyReferenced) {
                        pkgTsconfig.references.push({ path: newModDirRel });
                        await writeFile(
                            pkgTsconfigPath,
                            JSON.stringify(pkgTsconfig, null, 4) + "\n",
                            "utf-8"
                        );
                        stdout(
                            `📦 Added '${newModDirRel}' to tsconfig.json references.`
                        );
                    }
                }

                // Add "composite": true to the sub-mod's tsconfig.json.
                const subTsconfigPath = path.join(
                    targetFolder,
                    "tsconfig.json"
                );
                if (existsSync(subTsconfigPath)) {
                    const subTsconfig = JSON.parse(
                        await readFile(subTsconfigPath, "utf-8")
                    );
                    if (
                        subTsconfig.compilerOptions &&
                        !subTsconfig.compilerOptions.composite
                    ) {
                        subTsconfig.compilerOptions.composite = true;
                        await writeFile(
                            subTsconfigPath,
                            JSON.stringify(subTsconfig, null, 4) + "\n",
                            "utf-8"
                        );
                    }
                }
            }
        }

        if (gitignore) {
            await createGitIgnore({ targetFolder, ...quiet });
        }

        stdout("🎉 Template has been successfully created!");
        if (packageManifest && modType !== ModType.Package) {
            stdout(colors.bold("\n⚠️ Run the following command to build:"));
            stdout(colors.bold(colors.yellow("  npm run build")));
        } else {
            stdout(
                colors.bold(
                    "\n⚠️ Please run the following commands to start developing:"
                )
            );
            if (cwd !== targetFolder) {
                const relativeTarget = path.relative(cwd, targetFolder);
                stdout(colors.bold(colors.yellow(`  cd ${relativeTarget}`)));
            }
            stdout(colors.bold(colors.yellow("  npm install")));
            if (modType === ModType.Package) {
                stdout(
                    colors.bold(
                        colors.yellow("  npx @spotfire/mods-sdk new action")
                    )
                );
                stdout(
                    colors.bold(
                        colors.yellow(
                            "  npx @spotfire/mods-sdk new visualization"
                        )
                    )
                );
            }
            stdout(colors.bold(colors.yellow("  npm run build")));
        }
        stdout(colors.bold("\nFor more info please see the README.md file."));
    } finally {
        rl.close();
    }

    async function replaceInFile(
        filePath: string,
        replaceFunction: (fileContents: string) => string
    ) {
        const fileContents = await readFile(filePath, "utf-8");
        await writeFile(filePath, replaceFunction(fileContents), "utf-8");
    }
}

async function ask(rl: readline.Interface, question: string) {
    let answer = "";

    while (answer !== "yes" && answer !== "no") {
        answer = await rl.question(`${question} [yes/no]\n`);

        if (answer !== "yes" && answer !== "no") {
            console.error(
                `Invalid answer '${answer}', please answer 'yes' or 'no'.`
            );
        }
    }

    return answer === "yes";
}

export function toModId(str: string) {
    const space = /\s\s*/g;
    const notValid = /[^A-z0-9- ]/g;
    return str.trim().toLowerCase().replace(notValid, "").replace(space, "-");
}

export function modIdToName(str: string) {
    return capitalize(capitalizeBeforeSeparators(str)).replace(/-/g, " ");
}
