// https://dev.to/arafat4693/typescript-utility-types-that-you-must-know-4m6k
export type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
};

export type DeepReadonly<T> = {
    readonly [P in keyof T]: T[P] extends (infer U)[]
        ? ReadonlyArray<DeepReadonly<U>>
        : T[P] extends object
            ? DeepReadonly<T[P]>
            : T[P];
};
