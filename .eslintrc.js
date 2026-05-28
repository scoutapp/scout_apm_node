module.exports = {
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  env: {
    node: true,
    es2020: true,
  },
  rules: {
    "@typescript-eslint/no-namespace": "off",
    "@typescript-eslint/no-var-requires": "off",
    "@typescript-eslint/no-require-imports": "off",
    "@typescript-eslint/no-shadow": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "warn",
    "@typescript-eslint/no-unused-expressions": "off",
    "no-unused-vars": "off",
    "@typescript-eslint/no-this-alias": "off",
    "no-case-declarations": "off",
    "prefer-rest-params": "off",
    "prefer-spread": "off",
    "no-useless-escape": "off",
  },
  ignorePatterns: ["dist/", "node_modules/"],
};
