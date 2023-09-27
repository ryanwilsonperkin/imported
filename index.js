const fs = require('fs');
const path = require('path');

const glob = require('glob');
const {parse} = require('@babel/parser');
const {default: traverse} = require('@babel/traverse');

const RESOLVE_DIRS = ['app', 'packages'];
const RESOLVE_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx', 'json'];
const ALL_FILES_GLOB = '@(app|packages)/**/*.@(ts|tsx|js|jsx)';

function fileExists(filename) {
  try {
    return fs.statSync(filename).isFile();
  } catch {
    return false;
  }
}

function resolveRelativeImportPath(directory, importPath) {
 // eg. directory/filename
 const resolvedExact = path.join(directory, importPath);
 if (fileExists(resolvedExact)) return resolvedExact;

 for (const extension of RESOLVE_EXTENSIONS) {
   // eg. directory/filename.ext
   const resolvedWithExtension = path.join(directory, `${importPath}.${extension}`);
   if (fileExists(resolvedWithExtension)) return resolvedWithExtension;

   // eg. directory/filename/index.ext
   const resolvedIndex = path.join(
     directory,
     importPath,
     `index.${extension}`,
   );
   if (fileExists(resolvedIndex)) return resolvedIndex;
 }
 return undefined;
}

function resolveImportPath(filename, importPath) {
  if (importPath.startsWith('.')) {
    const filedir = path.dirname(filename);
    return resolveRelativeImportPath(filedir, importPath);
  }
  for (const dir of RESOLVE_DIRS) {
    const result = resolveRelativeImportPath(dir, importPath);
    if (result) return result;
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
