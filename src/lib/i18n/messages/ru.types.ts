import type { ru } from "./ru";

/** Every string the product has, shaped by the Russian source. */
export type Full = typeof ru;

/** Translations may lag behind: each branch is optional, but no key may be
 *  invented. t() falls back to Russian for whatever is missing. */
export type Messages = DeepPartial<Full>;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends string
    ? string
    : T[K] extends readonly (infer U)[]
      ? U extends object
        ? DeepPartial<U>[]
        : T[K]
      : T[K] extends object
        ? DeepPartial<T[K]>
        : T[K];
};
