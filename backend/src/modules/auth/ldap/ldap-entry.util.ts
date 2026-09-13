/** Ver la nota en `ldap-client.service.ts`: distintas versiones de `ldapjs`
 * exponen los atributos de una entrada de dos formas — aplanada en
 * `entry.object.<attr>`, o como lista en `entry.attributes[].{type,values|vals}`.
 * Se extraen como funciones puras (sin dependencia de `ldapjs` ni de una
 * conexión real) para poder probarlas con un objeto de ejemplo. */
export interface LdapEntryLike {
  dn?: unknown;
  objectName?: unknown;
  object?: Record<string, unknown>;
  attributes?: Array<{ type: string; values?: string[]; vals?: string[] }>;
}

export function entryDn(entry: LdapEntryLike): string {
  const dn = entry.dn ?? entry.objectName;
  return typeof dn === 'string' ? dn : String(dn);
}

export function readLdapAttribute(entry: LdapEntryLike, name: string): string | undefined {
  const fromObject = entry.object?.[name];
  if (typeof fromObject === 'string') return fromObject;
  if (Array.isArray(fromObject) && typeof fromObject[0] === 'string') return fromObject[0];

  const attr = entry.attributes?.find((a) => a.type.toLowerCase() === name.toLowerCase());
  const values = attr?.values ?? attr?.vals;
  return values?.[0];
}
