'use strict';

export function map<A, B>(value: A | undefined, f: (value: A) => B): B | undefined {
    if (value === undefined) return undefined;
    return f(value);
}