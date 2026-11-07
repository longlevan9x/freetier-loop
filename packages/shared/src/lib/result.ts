export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const okResult = <T>(value: T): Result<T, never> => ({
  ok: true,
  value,
});

export const errResult = <E>(error: E): Result<never, E> => ({
  ok: false,
  error,
});
