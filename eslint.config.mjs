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
    // Enforce @/ path aliases — prevent bare relative parent imports
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*'],
              message:
                'Use the @/ path alias instead of relative parent imports (e.g. "@/lib/firebase" instead of "../../lib/firebase").',
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
