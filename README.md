# imported

A utility for analyzing JavaScript import dependencies

## Examples

Find all of the imports in files under the A/ directory:

```
npx github:ryanwilsonperkin/imported ls-dependencies 'A/**'
```

Find all the files that import the A.js file from the B/ and C/ directories:

```
npx github:ryanwilsonperkin/imported ls-dependants A.js 'B/**' 'C/**'
```
