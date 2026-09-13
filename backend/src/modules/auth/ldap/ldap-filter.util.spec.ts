import { describe, expect, it } from 'vitest';
import { buildLdapSearchFilter, escapeLdapFilterValue } from './ldap-filter.util.js';

describe('escapeLdapFilterValue', () => {
  it('deja intactos los valores sin caracteres especiales', () => {
    expect(escapeLdapFilterValue('jperez')).toBe('jperez');
  });

  it('escapa paréntesis, asterisco y backslash (RFC 4515)', () => {
    expect(escapeLdapFilterValue('(a*b)\\c')).toBe('\\28a\\2ab\\29\\5cc');
  });

  it('bloquea un intento de inyección de filtro LDAP', () => {
    // Sin escapar, esto convertiría `(sAMAccountName={{username}})` en un
    // filtro distinto que siempre matchea (bypass de autenticación).
    const malicious = '*)(uid=*';
    const escaped = escapeLdapFilterValue(malicious);
    expect(escaped).not.toContain('*)');
    expect(escaped).not.toContain('(uid=');
  });
});

describe('buildLdapSearchFilter', () => {
  it('sustituye el placeholder {{username}} ya escapado', () => {
    const filter = buildLdapSearchFilter('(sAMAccountName={{username}})', 'jperez');
    expect(filter).toBe('(sAMAccountName=jperez)');
  });

  it('neutraliza una inyección en el username antes de interpolarlo', () => {
    // `=` no necesita escaparse dentro del valor (RFC 4515) — lo que importa es
    // que `(`, `)` y `*` queden codificados para que el parser LDAP no los
    // interprete como estructura de filtro, solo como texto literal del valor.
    const filter = buildLdapSearchFilter('(sAMAccountName={{username}})', '*)(uid=*');
    expect(filter).toBe('(sAMAccountName=\\2a\\29\\28uid=\\2a)');
  });
});
