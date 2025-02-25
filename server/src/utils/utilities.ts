// https://dev.to/arafat4693/typescript-utility-types-that-you-must-know-4m6k

/**
 * Returns a type with the `readonly` modifier removed from all properties of the given object type.
 * This enables destructive changes, so it should only be used during object construction.
 */
export type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
};

// export type DeepMutable<T> = {
//     -readonly [P in keyof T]: T[P] extends (infer U)[]
//         ? Array<DeepMutable<U>>
//         : T[P] extends object
//             ? DeepMutable<T[P]>
//             : T[P];
// };

export type DeepReadonly<T> = {
    readonly [P in keyof T]: T[P] extends (infer U)[]
        ? ReadonlyArray<DeepReadonly<U>>
        : T[P] extends object
            ? DeepReadonly<T[P]>
            : T[P];
};
