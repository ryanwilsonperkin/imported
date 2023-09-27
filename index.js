const fs = require('fs');
const path = require('path');

const glob = require('glob');
const {parse} = require('@babel/parser');
const {default: traverse} = require('@babel/traverse');

const RESOLVE_DIRS = ['app', 'packages'];
const RESOLVE_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx'];
const ALL_FILES_GLOB = '@(app|packages)/**/*.@(ts|tsx|js|jsx)';

function fileExists(filename) {
  try {
    return fs.statSync(filename).isFile();
  } catch {
    return false;
  }
}

function resolveImportPath(filename, importPath) {
  const filedir = path.dirname(filename);
  if (importPath.startsWith('.')) {
    // eg ./filename.scss
    const resolvedExact = path.join(filedir, importPath);
    if (fileExists(resolvedExact)) return resolvedExact;

    for (const extension of RESOLVE_EXTENSIONS) {
      // eg ./filename.ext
      const resolvedWithExtension = path.join(filedir, `${importPath}.${extension}`);
      if (fileExists(resolvedWithExtension)) {
        return resolvedWithExtension;
      }
      // eg ./filename/index.ext
      const resolvedIndex = path.join(
        filedir,
        importPath,
        `index.${extension}`,
      );
      if (fileExists(resolvedIndex)) {
        return resolvedIndex;
      }
    }
    return undefined;
  }

  for (const dir of RESOLVE_DIRS) {
    // eg sections/Foo/filename.scss
    const resolvedExact = path.join(dir, importPath);
    if (fileExists(resolvedExact)) return resolvedExact;

    for (const extension of RESOLVE_EXTENSIONS) {
      // eg sections/Foo/filename.ext
      const resolvedWithExtension = path.join(dir, `${importPath}.${extension}`);
      if (fileExists(resolvedWithExtension)) {
        return resolvedWithExtension;
      }
      // eg sections/Foo/filename/index.ext
      const resolvedIndex = path.join(dir, importPath, `index.${extension}`);
      if (fileExists(resolvedIndex)) {
        return resolvedIndex;
      }
    }
  }

  return undefined;
}

function getImports(filename) {
  try {
    const file = fs.readFileSync(filename, {encoding: 'utf8'});
    const ast = parse(file, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators'],
    });
    const imports = [];
    traverse(ast, {
      // import x from './x';
      ImportDeclaration: (nodePath) => {
        if (!nodePath.node.source || !nodePath.node.source.value) return;
        const rawPath = nodePath.node.source.value;
        const importPath = resolveImportPath(filename, rawPath);
        if (importPath) imports.push(importPath);
      },
      // import('./x')
      ImportExpression: (nodePath) => {
        if (!nodePath.node.source) return;
        // Ignore constant template literals, import(`.x`);
        if (nodePath.node.source.type === 'TemplateLiteral') return;
        const rawPath = nodePath.node.source.value;
        const importPath = resolveImportPath(filename, rawPath);
        if (importPath) imports.push(importPath);
      },
      // export { x } from './x';
      ExportNamedDeclaration: (nodePath) => {
        if (!nodePath.node.source || !nodePath.node.source.value) return;
        const rawPath = nodePath.node.source.value;
        const importPath = resolveImportPath(filename, rawPath);
        if (importPath) imports.push(importPath);
      },
      ExportAllDeclaration: (nodePath) => {
        if (!nodePath.node.source || !nodePath.node.source.value) return;
        const rawPath = nodePath.node.source.value;
        const importPath = resolveImportPath(filename, rawPath);
        if (importPath) imports.push(importPath);
      },
    });
    return imports;
  } catch (error) {
    console.error(`Error while parsing: ${filename}`);
    throw error;
  }
}

function getAllImports(filenames) {
  const importPaths = new Set();
  filenames.forEach((filename) => {
    getImports(filename).forEach((importPath) => {
      importPaths.add(importPath);
    });
  });
  return importPaths;
}

function main() {
  const requestedFile = process.argv[2];
  let importedPaths;
  if (requestedFile) {
    importedPaths = getImports(requestedFile);
  } else {
    const allFilenames = glob.sync(ALL_FILES_GLOB, {
      nodir: true,
      ignore: '**/*.d.ts',
    });
    importedPaths = getAllImports(allFilenames);
  }
  Array.from(importedPaths)
    .sort()
    .forEach((importPath) => {
      console.log(importPath);
    });
}

main();
