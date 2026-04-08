/**
 * Dependency Cruiser configuration for TaskStream/PortalWorks.
 *
 * The rules start deliberately small: enforce project-level hygiene
 * (no cycles, all imports resolvable) and protect the clean architectural
 * boundaries between domain, application, infrastructure, and tests.
 *
 * Tighten or extend the rule set incrementally as new invariants emerge.
 * See https://github.com/sverweij/dependency-cruiser for rule options.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  extends: ['dependency-cruiser/configs/recommended-warn-only'],
  forbidden: [
    {
      name: 'no-circular-dependencies',
      comment: 'Prevent circular dependencies anywhere in the workspace.',
      severity: 'error',
      from: { path: '^(src|packages)' },
      to: { circular: true },
    },
    {
      name: 'domain-keeps-isolation',
      comment: 'Domain must stay pure and not depend on application or infrastructure layers.',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { path: '^src/(application|infrastructure)' },
    },
    {
      name: 'application-avoids-infrastructure',
      comment: 'Application logic should use interfaces/contracts instead of concrete infrastructure code.',
      severity: 'warn',
      from: { path: '^src/application' },
      to: { path: '^src/infrastructure' },
    },
    {
      name: 'no-test-leaks',
      comment: 'Production code must not import test utilities directly.',
      severity: 'error',
      from: {
        path: '^src/(application|domain|infrastructure|modules|tenants|utils|workflows)',
        pathNot: '__tests__|tests|test-utils',
      },
      to: { path: '^src/(test-utils|__tests__|tests)' },
    },
  ],
  options: {
    baseDir: '.',
    includeOnly: '^(src|packages)',
    exclude: '(coverage|dist|test-results|tmp|docs)',
    doNotFollow: {
      path: '(node_modules|dist)',
    },
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      conditionNames: ['import', 'types', 'node'],
      extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json'],
      mainFields: ['module', 'types', 'main'],
    },
    reporterOptions: {
      dot: {
        theme: {
          graph: {
            rankdir: 'LR',
            splines: 'ortho',
          },
        },
      },
    },
  },
};
