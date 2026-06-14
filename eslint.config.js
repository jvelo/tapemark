import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";
import licenseHeader from "eslint-plugin-license-header";

const MPL_HEADER = [
  "/*",
  " * SPDX-License-Identifier: MPL-2.0",
  " *",
  " * This Source Code Form is subject to the terms of the Mozilla Public",
  " * License, v. 2.0. If a copy of the MPL was not distributed with this",
  " * file, You can obtain one at https://mozilla.org/MPL/2.0/.",
  " */",
];

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "**/dist/",
      "**/node_modules/",
      "**/*.js",
      "!**/assets/tapemark.js",
      "**/*.d.ts",
    ],
  },

  // Base: recommended TS rules
  ...tseslint.configs.recommended,

  // All TS/TSX files
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "import-x": importX,
      "license-header": licenseHeader,
    },
    rules: {
      "license-header/header": ["error", MPL_HEADER],

      // Correctness
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // Imports
      "import-x/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "type",
          ],
          "newlines-between": "never",
        },
      ],
      "import-x/no-duplicates": "error",

      // Off — style rules we don't enforce
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-namespace": "off",
    },
  },

  // Client-side JS: basic linting without TS rules
  {
    files: ["**/assets/tapemark.js"],
    plugins: {
      "license-header": licenseHeader,
    },
    rules: {
      "license-header/header": ["error", MPL_HEADER],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Test files: relax some rules
  {
    files: ["**/__tests__/**", "**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
