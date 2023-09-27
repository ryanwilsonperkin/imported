const fs = require("fs");
const path = require("path");

const yargs = require("yargs");
const glob = require("glob");
const { parse } = require("@babel/parser");
const { default: traverse } = require("@babel/traverse");

const MODULE_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx"];
const MODULE_IGNORES = [
  "**/*.d.ts",
  "node_modules/**",
];
const RESOLVE_DIRS = ["app", "packages"];
const RESOLVE_EXTENSIONS = ["js", "jsx", "ts", "tsx", "json"];

class Searcher {
  constructor() {
    this.filecache = new Map();
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
  
  getImports(filename) {
    try {
      const file = fs.readFileSync(filename, { encoding: "utf8" });
      const ast = parse(file, {
        sourceType: "module",
        plugins: ["jsx", "typescript", "decorators"],
      });
      const imports = new Set();
      traverse(ast, {
        // import x from './x';
        ImportDeclaration: (nodePath) => {
          if (!nodePath.node.source || !nodePath.node.source.value) return;
          const rawPath = nodePath.node.source.value;
          const importPath = this.resolveImportPath(filename, rawPath);
          if (importPath) imports.add(importPath);
        },
        // import('./x')
        ImportExpression: (nodePath) => {
          if (!nodePath.node.source) return;
          // Ignore constant template literals, import(`.x`);
          if (nodePath.node.source.type === "TemplateLiteral") return;
          const rawPath = nodePath.node.source.value;
          const importPath = this.resolveImportPath(filename, rawPath);
          if (importPath) imports.add(importPath);
        },
        // export { x } from './x';
        ExportNamedDeclaration: (nodePath) => {
          if (!nodePath.node.source || !nodePath.node.source.value) return;
          const rawPath = nodePath.node.source.value;
          const importPath = this.resolveImportPath(filename, rawPath);
          if (importPath) imports.add(importPath);
        },
        ExportAllDeclaration: (nodePath) => {
          if (!nodePath.node.source || !nodePath.node.source.value) return;
          const rawPath = nodePath.node.source.value;
          const importPath = this.resolveImportPath(filename, rawPath);
          if (importPath) imports.add(importPath);
        },
      });
      return imports;
    } catch (error) {
      console.error(`Error while parsing: ${filename}`);
      throw error;
    }
  }
  
  getAllImports(filenames) {
    const importPaths = new Set();
    filenames.forEach((filename) => {
      this.getImports(filename).forEach((importPath) => {
        importPaths.add(importPath);
      });
    });
    return importPaths;
  }
}

function main() {
  const searcher = new Searcher();
  yargs
    .scriptName("imported")
    .usage("$0 <cmd> [args]")
    .command(
      "ls-dependencies [pattern..]",
      "find all imported dependencies",
      (yargs) => {
        yargs.positional("pattern", {
          type: "string",
          array: true,
          default: ['**'],
          describe: "glob pattern of files to find imported dependencies",
        });
      },
      function (argv) {
        const allFilenames = searcher.findModules(argv.pattern);
        Array.from(searcher.getAllImports(allFilenames))
          .sort()
          .forEach((importPath) => {
            console.log(importPath);
          });
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
          default: ['**'],
          describe: "glob pattern of files to find imported dependencies",
        });
      },
      function (argv) {
        const allFilenames = searcher.findModules(argv.pattern);
        for (const filename of allFilenames.sort()) {
          const importPaths = searcher.getImports(filename);
          if (importPaths.has(argv.file)) console.log(filename);
        }
      }
    )
    .demandCommand()
    .help().argv;
}

main();
