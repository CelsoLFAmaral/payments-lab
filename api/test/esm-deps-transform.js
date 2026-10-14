// @nestjs/typeorm 12 é ESM-only e usa import.meta; o Jest roda em CJS (Node < 24.9 não faz require(esm)).
// Troca import.meta.url antes de o ts-jest converter o módulo para CommonJS.
const { TsJestTransformer } = require('ts-jest');

const inner = new TsJestTransformer({
  tsconfig: { allowJs: true, module: 'commonjs', target: 'ES2023' },
});

module.exports = {
  process(source, filePath, options) {
    const patched = !source.includes('import.meta')
      ? source
      : source
      .replaceAll('import.meta.url', '"file://" + __filename')
      .replaceAll('const require = createRequire', 'const localRequire = createRequire')
      .replaceAll('require(', 'localRequire(');
    return inner.process(patched, filePath, options);
  },
  getCacheKey(source, filePath, options) {
    return inner.getCacheKey(source, filePath, options) + ':esm-deps-v2';
  },
};
