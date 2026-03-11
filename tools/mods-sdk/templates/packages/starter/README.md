# Package Mod

This is a package mod that bundles multiple mods together.

## Prerequisites

- [Node.js](https://nodejs.org/) (v22 or later)
- [Visual Studio Code](https://code.visualstudio.com/) (recommended)

## Getting started

Add mods to this package:

```bash
npx @spotfire/mods-sdk new action
npx @spotfire/mods-sdk new visualization
```

Install dependencies and build all sub-mods:

```bash
npm install
npm run build
```

To build in watch mode with debug output:

```bash
npm run build:dev
```
