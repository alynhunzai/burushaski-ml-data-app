import { configs } from "@eslint/js";
import { rules as _rules } from "eslint-config-google";
import globals from "globals";

export default [
  configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2018,
      sourceType: "commonjs",
      globals: {
        // Equates to env: { node: true, es6: true }
        process: "readonly",
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ..._rules,
      "no-restricted-globals": ["error", "name", "length"],
      "prefer-arrow-callback": "error",
      "quotes": ["error", "double", {"allowTemplateLiterals": true}],
      "no-unused-vars": "error",
    },
  },
];
