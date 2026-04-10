/** @type {import('eslint').Linter.Config} */
// eslint-disable-next-line no-undef
module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'],
    rules: {
        'prettier/prettier': ['warn', { endOfLine: 'auto' }],
        semi: ['warn', 'always'],
        '@typescript-eslint/no-unused-vars': 0,
        '@typescript-eslint/no-explicit-any': 0,
        '@typescript-eslint/explicit-module-boundary-types': 0,
        '@typescript-eslint/no-non-null-assertion': 0,
        'padding-line-between-statements': 'off',
        '@typescript-eslint/padding-line-between-statements': [
            'warn',
            {
                blankLine: 'always',
                prev: ['if', 'for', 'while', 'switch', 'try'],
                next: '*'
            }
        ],
        curly: ['warn', 'all']
    }
};