type Route =
  | "/"
  | "/home"
  | "/login"
  | "/logout"
  | "/claim"
  | "/frame/:name"
  | "/canvas/:canvasId"
  | "/invite/:token"
  | "/api/claim"
  | "/api/uploads/:id";

type ExtractParams<T extends string> =
  T extends `${string}:${infer P}/${infer Rest}`
    ? P | ExtractParams<Rest>
    : T extends `${string}:${infer P}`
      ? P
      : never;

type RouteArgs<T extends string> = [ExtractParams<T>] extends [never]
  ? []
  : [params: { [K in ExtractParams<T>]: string }];

export function route<T extends Route>(
  path: T,
  ...args: RouteArgs<T>
): string {
  const params = args[0] as Record<string, string> | undefined;
  if (!params) return path;
  return path.replace(/:(\w+)/g, (_, key) => params[key]!);
}
