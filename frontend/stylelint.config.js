// frontend/stylelint.config.js
/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  plugins: ['stylelint-value-no-unknown-custom-properties'],
  rules: {
    'csstools/value-no-unknown-custom-properties': [
      true,
      {
        importFrom: ['src/v2/styles/tokens.css'],
      },
    ],
    'declaration-block-no-redundant-longhand-properties': null,
    'no-descending-specificity': null,
    'rule-empty-line-before': null,
    'color-function-notation': null,
    'color-function-alias-notation': null,
    'alpha-value-notation': null,
    'comment-empty-line-before': null,
    'declaration-empty-line-before': null,
    'custom-property-empty-line-before': null,
    'selector-class-pattern': null,
    'no-duplicate-selectors': null,
    'media-feature-range-notation': null,
    'value-keyword-case': null,
    'shorthand-property-no-redundant-values': null,
    'number-max-precision': null,
    'length-zero-no-unit': null,
    'hue-degree-notation': null,
    'function-no-unknown': null,
    'color-hex-length': null,
    'import-notation': null,
    'at-rule-no-unknown': [true, { ignoreAtRules: ['tailwind', 'apply', 'variants', 'responsive', 'screen', 'layer'] }],
  },
  ignoreFiles: ['dist/**', 'dist-v2/**', 'node_modules/**', 'src/legacy/**', 'src/index.css'],
}
