// .pnpmfile.cjs — Force-patch transitive dependencies with known vulnerabilities
// https://pnpm.io/pnpmfile

module.exports = {
  hooks: {
    readPackage(pkg) {
      // nanoid <3.3.18 — high severity (GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8)
      if (pkg.dependencies?.nanoid) {
        pkg.dependencies.nanoid = '>=3.3.18';
      }
      if (pkg.devDependencies?.nanoid) {
        pkg.devDependencies.nanoid = '>=3.3.18';
      }

      // react-router <7.18.0 — moderate (GHSA-wrjc-x8rr-h8h6, GHSA-337j-9hxr-rhxg)
      if (pkg.dependencies?.['react-router']) {
        pkg.dependencies['react-router'] = '>=7.18.0';
      }
      if (pkg.devDependencies?.['react-router']) {
        pkg.devDependencies['react-router'] = '>=7.18.0';
      }

      // react-router-dom — moderate (GHSA-jjmj-jmhj-qwj2)
      if (pkg.dependencies?.['react-router-dom']) {
        pkg.dependencies['react-router-dom'] = '>=7.18.0';
      }
      if (pkg.devDependencies?.['react-router-dom']) {
        pkg.devDependencies['react-router-dom'] = '>=7.18.0';
      }

      // postcss <=8.5.22 — moderate (GHSA-fxqj-rqcc-2cmp)
      if (pkg.dependencies?.postcss) {
        pkg.dependencies.postcss = '>=8.5.23';
      }
      if (pkg.devDependencies?.postcss) {
        pkg.devDependencies.postcss = '>=8.5.23';
      }

      return pkg;
    },
  },
};
