const fs = require("fs");
const path = require("path");

const yargs = require("yargs");
const glob = require("glob");
const { parse } = require("@babel/parser");
const { default: traverse } = require("@babel/traverse");

const MODULE_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx"];
const MODULE_IGNORES = ["**/*.d.ts", "node_modules/**"];
const RESOLVE_DIRS = ["app", "packages"];
const RESOLVE_EXTENSIONS = ["js", "jsx", "ts", "tsx", "json"];

class Searcher {
  constructor() {
    this.filecache = new Map();
  }

  listDependencies(patterns, follow) {
    return this.getAllImports(this.findModules(patterns), follow);
  }

  listDependants(file, patterns) {
    const modules = this.findModules(patterns);
    const dependants = [];
    for (const filename of modules) {
      const importPaths = this.getImports(filename, false);
      if (importPaths.has(file)) dependants.push(filename);
    }
    return dependants;
  }

  findModules(patterns) {
    return glob
      .sync(patterns, { nodir: true, ignore: MODULE_IGNORES })
      .filter((file) => MODULE_EXTENSIONS.includes(path.extname(file)));
  }

  fileExists(filename) {
    if (this.filecache.has(filename)) return this.filecache.get(filename);
    let exists;
    try {
      exists = fs.statSync(filename).isFile();
    } catch {
      exists = false;
    }
    this.filecache.set(filename, exists);
    return exists;
  }

  resolveRelativeImportPath(directory, importPath) {
    // eg. directory/filename
    const resolvedExact = path.join(directory, importPath);
    if (this.fileExists(resolvedExact)) return resolvedExact;

    for (const extension of RESOLVE_EXTENSIONS) {
      // eg. directory/filename.ext
      const resolvedWithExtension = path.join(
        directory,
        `${importPath}.${extension}`
      );
      if (this.fileExists(resolvedWithExtension)) return resolvedWithExtension;

      // eg. directory/filename/index.ext
      const resolvedIndex = path.join(
        directory,
        importPath,
        `index.${extension}`
      );
      if (this.fileExists(resolvedIndex)) return resolvedIndex;
    }
    return undefined;
  }

  resolveImportPath(filename, importPath) {
    if (importPath.startsWith(".")) {
      const filedir = path.dirname(filename);
      return this.resolveRelativeImportPath(filedir, importPath);
    }
    for (const dir of RESOLVE_DIRS) {
      const result = this.resolveRelativeImportPath(dir, importPath);
      if (result) return result;
    }
    return undefined;
  }

  getImports(filename, follow, imports = new Set()) {
    // Don't attempt to parse non-module files
    if (!MODULE_EXTENSIONS.includes(path.extname(filename))) return imports;

    try {
      const file = fs.readFileSync(filename, { encoding: "utf8" });
      const ast = parse(file, {
        sourceType: "module",
        plugins: ["jsx", "typescript", "decorators"],
        createImportExpressions: true,
      });
      traverse(ast, {
        // import x from './x';
        ImportDeclaration: (nodePath) => {
          if (!nodePath.node.source || !nodePath.node.source.value) return;
          const rawPath = nodePath.node.source.value;
          const importPath = this.resolveImportPath(filename, rawPath);
          if (importPath && !imports.has(importPath)) {
            imports.add(importPath);
            if (follow) this.getImports(importPath, follow, imports);
          }
        },
        // import('./x')
        ImportExpression: (nodePath) => {
          if (!nodePath.node.source) return;
          if (nodePath.node.source.type !== "StringLiteral") {
            console.error("Encountered unexpected dynamic import type:", nodePath.node.source.type, {
              filename,
              loc: nodePath.node.loc,
            });
            return;
          }
          const rawPath = nodePath.node.source.value;
          const importPath = this.resolveImportPath(filename, rawPath);
          if (importPath && !imports.has(importPath)) {
            imports.add(importPath);
            if (follow) this.getImports(importPath, follow, imports);
          }
        },
        // export { x } from './x';
        ExportNamedDeclaration: (nodePath) => {
          if (!nodePath.node.source || !nodePath.node.source.value) return;
          const rawPath = nodePath.node.source.value;
          const importPath = this.resolveImportPath(filename, rawPath);
          if (importPath && !imports.has(importPath)) {
            imports.add(importPath);
            if (follow) this.getImports(importPath, follow, imports);
          }
        },
        ExportAllDeclaration: (nodePath) => {
          if (!nodePath.node.source || !nodePath.node.source.value) return;
          const rawPath = nodePath.node.source.value;
          const importPath = this.resolveImportPath(filename, rawPath);
          if (importPath && !imports.has(importPath)) {
            imports.add(importPath);
            if (follow) this.getImports(importPath, follow, imports);
          }
        },
      });
      return imports;
    } catch (error) {
      console.error(`Error while parsing: ${filename}`);
      throw error;
    }
  }

  getAllImports(filenames, follow) {
    const importPaths = new Set();
    filenames.forEach((filename) => {
      this.getImports(filename, follow).forEach((importPath) => {
        importPaths.add(importPath);
      });
    });
    return importPaths;
  }
}

function main() {
  yargs
    .scriptName("imported")
    .usage("$0 <cmd> [args]")
    .command(
      "ls-dependencies [pattern..]",
      "find all imported dependencies",
      (yargs) => {
        yargs.option("follow", {
          type: "boolean",
          default: false,
          describe: "whether to follow dependencies",
        });
        yargs.positional("pattern", {
          type: "string",
          array: true,
          default: ["**"],
          describe: "glob pattern of files to find imported dependencies",
        });
      },
      function (argv) {
        const searcher = new Searcher();
        searcher
          .listDependencies(argv.pattern, argv.follow)
          .forEach((dependency) => console.log(dependency));
      }
    )
    .command(
      "ls-dependants <file> [pattern..]",
      "find all files that depend on the given file",
      (yargs) => {
        yargs.positional("file", {
          type: "string",
          demandOption: true,
          describe: "file name to search for",
        });
        yargs.positional("pattern", {
          type: "string",
          array: true,
          default: ["**"],
          describe: "glob pattern of files to find imported dependencies",
        });
      },
      function (argv) {
        const searcher = new Searcher();
        searcher
          .listDependants(argv.file, argv.pattern)
          .forEach((dependant) => console.log(dependant));
      }
    )
    .demandCommand()
    .help().argv;
}

main();
