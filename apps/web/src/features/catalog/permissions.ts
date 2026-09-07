export function hasPermission(permissions: ReadonlyArray<string> | undefined, key: string): boolean {
  return (permissions ?? []).includes(key);
}

export function hasEveryPermission(permissions: ReadonlyArray<string> | undefined, keys: ReadonlyArray<string>): boolean {
  return keys.every((key) => hasPermission(permissions, key));
}
