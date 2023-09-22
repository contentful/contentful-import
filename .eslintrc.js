module.exports = {
  parser: "@typescript-eslint/parser",
  extends: [
    "standard",
    "plugin:jest/recommended",
    "plugin:@typescript-eslint/recommended", // Recommended TypeScript rules
  ],
  plugins: ["standard", "promise", "@typescript-eslint"],
  rules: {
    "@typescript-eslint/no-var-requires": "warn",
    "@typescript-eslint/no-unused-vars": "warn",
    "space-before-function-paren": "warn",
  },
};
