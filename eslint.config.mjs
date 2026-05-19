import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'mqtt-listener/**',
  ]),
  {
    rules: {
      'no-restricted-imports': [
        'error',           // severity: 'error' means lint FAILS (not just a warning)
        {
          patterns: [
            {
              group: ['../*'],   // catches any import that starts with ../
              message:
                'Use the @/ path alias instead of relative parent imports (e.g. "@/lib/firebase" instead of "../../lib/firebase").',
            },
          ],
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',           // severity: 'error' means lint FAILS, not just warns
        {
          vars: 'all',               // check ALL declared variables, including imports
          args: 'after-used',        // for function arguments: only flag if no
                                     // later argument in the list is used either
          ignoreRestSiblings: true,  // allow: const { a, ...rest } = obj
                                     // (common pattern to intentionally omit 'a')
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
]);

export default eslintConfig;
