import { existsSync } from "fs";
import { readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { loadUserEsbuildConfig } from "./build.js";
import {
    ApiVersion,
    QuietOtions,
    formatIfPossible,
    getVersion,
    maxKnownApiVersion,
    mkStdout,
    parseApiVersion,
    readManifest,
    toTypeName,
    writeManifest,
} from "./utils.js";

interface MigrateOptions {
    manifestPath: string;
    packagePath: string;
    scripts: string;
    esbuildConfig: string;
}

const scriptFileRegex = /\.(ts|tsx|js|jsx)$/;

/**
 * Migrates a mod project to a new Mods API version. This updates the manifest
 * and package.json and applies easy-to-fix breaking changes introduced by the
 * target version, warning about anything that needs manual attention.
 */
export async function migrate(
    apiVersionArg: string,
    {
        manifestPath: _manifestPath,
        packagePath: _packagePath,
        scripts: _scripts,
        esbuildConfig: _esbuildConfig,
        ...quiet
    }: MigrateOptions & QuietOtions
) {
    const stdout = mkStdout(quiet);

    const apiVersionResult = parseApiVersion(apiVersionArg);
    if (apiVersionResult.status === "error") {
        throw new Error(
            `Invalid api version '${apiVersionArg}': ${apiVersionResult.error}`
        );
    }
    const apiVersion = apiVersionResult.result;

    const maxKnown = maxKnownApiVersion();
    if (apiVersion.isNewerThan(maxKnown)) {
        stdout(
            `Warning: apiVersion '${apiVersion.toManifest()}' is newer than the latest version known to this @spotfire/mods-sdk (${maxKnown.toManifest()}). Check if a newer version of @spotfire/mods-sdk has been published.`
        );
    }

    const manifestPath = path.resolve(_manifestPath);
    if (!existsSync(manifestPath)) {
        throw new Error(`Cannot find manifest at '${manifestPath}'.`);
    }

    await migrateManifest(manifestPath, apiVersion, quiet);

    const packagePath = path.resolve(_packagePath);
    if (!existsSync(packagePath)) {
        stdout(
            `Warning: Could not find package.json at '${packagePath}', skipping dependency update.`
        );
    } else {
        await migratePackageJson(packagePath, apiVersion, quiet);
    }

    await validateEsbuildConfig(
        path.resolve(_esbuildConfig),
        apiVersion,
        quiet
    );

    const scriptsDir = path.resolve(_scripts);
    if (!existsSync(scriptsDir)) {
        stdout(
            `Warning: Could not find scripts folder at '${scriptsDir}', skipping RegisterEntryPoint check.`
        );
    } else {
        await warnMissingRegisterEntryPoint(scriptsDir, quiet);
    }

    stdout(`Migration to apiVersion ${apiVersion.toManifest()} finished.`);
}

/**
 * Updates the manifest apiVersion and applies breaking changes for the target
 * version. From apiVersion 2.6 the 'entryPoint' field is removed from scripts
 * (entry points are registered via RegisterEntryPoint instead).
 */
async function migrateManifest(
    manifestPath: string,
    apiVersion: ApiVersion,
    quiet: QuietOtions
) {
    const stdout = mkStdout(quiet);
    const manifest = await readManifest(manifestPath);
    const previousVersion = manifest.apiVersion;
    manifest.apiVersion = apiVersion.toManifest();

    let removedEntryPoints = 0;
    if (apiVersion.supportsFeature("Esm") && manifest.scripts) {
        for (const script of manifest.scripts) {
            if (script.entryPoint == null) {
                continue;
            }

            // From apiVersion 2.6 the generated parameters interface is derived
            // from the script id instead of the entry point. Warn when that
            // changes the generated name so the user can update their source.
            if (script.id) {
                const oldName = toTypeName(script.entryPoint) + "Parameters";
                const newName = toTypeName(script.id) + "Parameters";
                if (oldName !== newName) {
                    stdout(
                        `Warning: The generated parameters interface for script '${script.id}' changes from '${oldName}' to '${newName}' (it is now derived from the script id). Update the type annotation in the script source accordingly.`
                    );
                }
            }

            delete script.entryPoint;
            removedEntryPoints++;
        }
    }

    await writeManifest(manifestPath, manifest, quiet.quiet);
    stdout(
        `Updated apiVersion in '${manifestPath}' from '${
            previousVersion ?? "unspecified"
        }' to '${manifest.apiVersion}'.`
    );
    if (removedEntryPoints > 0) {
        stdout(
            `Removed the 'entryPoint' field from ${removedEntryPoints} script(s); entry points are now registered solely via RegisterEntryPoint.`
        );
    }
}

/**
 * Ensures package.json references a compatible @spotfire/mods-api for the target
 * version, and bumps @spotfire/mods-sdk to the running version so that the build
 * tooling matches the API (required from apiVersion 2.6).
 */
async function migratePackageJson(
    packagePath: string,
    apiVersion: ApiVersion,
    quiet: QuietOtions
) {
    const stdout = mkStdout(quiet);
    const raw = await readFile(packagePath, "utf-8");
    let pkg: Record<string, any>;
    try {
        pkg = JSON.parse(raw);
    } catch (e) {
        stdout(
            `Warning: Could not parse '${packagePath}' as JSON, skipping dependency update. ${e}`
        );
        return;
    }

    const apiRange = `~${apiVersion.toPackage()}`;
    setDependency(pkg, "@spotfire/mods-api", apiRange, true);
    stdout(`Set '@spotfire/mods-api' to '${apiRange}' in '${packagePath}'.`);

    const sdkRange = `^${await getVersion()}`;
    if (setDependency(pkg, "@spotfire/mods-sdk", sdkRange, false)) {
        stdout(
            `Set '@spotfire/mods-sdk' to '${sdkRange}' in '${packagePath}'.`
        );
    }

    // Indent the fallback so package.json stays readable when prettier is not
    // installed (formatIfPossible re-formats it when prettier is available).
    const output = await formatIfPossible(
        packagePath,
        JSON.stringify(pkg, null, 4),
        quiet.quiet
    );
    await writeFile(packagePath, output, "utf-8");
}

/**
 * Sets a dependency range wherever it already appears in the package.json. When
 * the dependency is missing and addIfMissing is true it is added to
 * devDependencies. Returns whether the dependency is now present.
 */
function setDependency(
    pkg: Record<string, any>,
    name: string,
    range: string,
    addIfMissing: boolean
) {
    const sections = ["dependencies", "devDependencies", "peerDependencies"];
    let found = false;
    for (const section of sections) {
        if (pkg[section] && name in pkg[section]) {
            pkg[section][name] = range;
            found = true;
        }
    }

    if (!found && addIfMissing) {
        pkg.devDependencies = pkg.devDependencies ?? {};
        pkg.devDependencies[name] = range;
        found = true;
    }

    return found;
}

/**
 * For ESM targets (apiVersion >= 2.6), warns when the user's esbuild config
 * would conflict with the ESM build requirements. The SDK enforces these
 * settings regardless, but a conflicting config is confusing.
 */
async function validateEsbuildConfig(
    esbuildConfigPath: string,
    apiVersion: ApiVersion,
    quiet: QuietOtions
) {
    if (!apiVersion.supportsFeature("Esm") || !existsSync(esbuildConfigPath)) {
        return;
    }

    const config = await loadUserEsbuildConfig(esbuildConfigPath);
    if (!config) {
        return;
    }

    const stdout = mkStdout(quiet);

    if (config.format != null && config.format !== "esm") {
        stdout(
            `Warning: '${esbuildConfigPath}' sets format '${config.format}', but action mods with apiVersion >= 2.6 are built as ES modules. The SDK enforces format 'esm'; remove the 'format' override from your esbuild config to avoid confusion.`
        );
    }

    const external = config.external;
    if (
        Array.isArray(external) &&
        !external.includes("spotfire") &&
        !external.includes("spotfire/*")
    ) {
        stdout(
            `Warning: '${esbuildConfigPath}' sets 'external' without "spotfire"/"spotfire/*". The Spotfire API must stay external for ESM action mods; the SDK re-adds it automatically, but consider adding it to your esbuild config.`
        );
    }
}

/**
 * Warns about every script source file which does not call RegisterEntryPoint,
 * as such files have no entry point Spotfire can invoke. Unreadable files are
 * reported as warnings rather than aborting the (already applied) migration.
 */
async function warnMissingRegisterEntryPoint(
    scriptsDir: string,
    quiet: QuietOtions
) {
    const stdout = mkStdout(quiet);
    const entries = await readdir(scriptsDir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isFile() || !scriptFileRegex.test(entry.name)) {
            continue;
        }

        const filePath = path.join(scriptsDir, entry.name);
        let content: string;
        try {
            content = await readFile(filePath, "utf-8");
        } catch (e) {
            stdout(
                `Warning: Could not read script file '${filePath}' to check for RegisterEntryPoint. ${e}`
            );
            continue;
        }

        if (!content.includes("RegisterEntryPoint")) {
            stdout(
                `Warning: Script file '${filePath}' does not call 'RegisterEntryPoint'. Each script must register its entry point so that Spotfire can invoke it.`
            );
        }
    }
}
