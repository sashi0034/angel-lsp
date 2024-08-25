// https://dev.to/arafat4693/typescript-utility-types-that-you-must-know-4m6k
export type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
};
