const swc = require('@swc/core');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const srcDir = path.join(root, 'src');
const outDir = path.join(root, 'dist');

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

function rewriteAliases(code, filePath) {
  const fromDir = path.dirname(filePath);
  return code.replace(
    /require\(["'](@\/|@common\/|@domains\/|@infrastructure\/|@api\/)([^"']+)["']\)/g,
    (_match, prefix, rest) => {
      const map = {
        '@/': 'src/',
        '@common/': 'src/common/',
        '@domains/': 'src/domains/',
        '@infrastructure/': 'src/infrastructure/',
        '@api/': 'src/api/',
      };
      const absolute = path.join(root, map[prefix] + rest);
      let relative = path.relative(fromDir, absolute).replace(/\\/g, '/');
      if (!relative.startsWith('.')) {
        relative = `./${relative}`;
      }
      return `require("${relative}")`;
    },
  );
}

const files = walk(srcDir);
for (const file of files) {
  const result = swc.transformFileSync(file, {
    sourceFileName: file,
    jsc: {
      parser: { syntax: 'typescript', decorators: true, dynamicImport: true },
      target: 'es2022',
      keepClassNames: true,
      transform: { decoratorMetadata: true, legacyDecorator: true },
    },
    module: { type: 'commonjs', ignoreDynamic: true },
    sourceMaps: false,
  });
  const relative = path.relative(srcDir, file).replace(/\.ts$/, '.js');
  const outFile = path.join(outDir, relative);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, rewriteAliases(result.code, outFile));
}

console.log(`compiled ${files.length} files`);
