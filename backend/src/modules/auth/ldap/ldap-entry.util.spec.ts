import { describe, expect, it } from 'vitest';
import { entryDn, readLdapAttribute } from './ldap-entry.util.js';

describe('entryDn', () => {
  it('lee `dn` cuando está presente', () => {
    expect(entryDn({ dn: 'CN=Juan Perez,OU=IT,DC=empresa,DC=local' })).toBe(
      'CN=Juan Perez,OU=IT,DC=empresa,DC=local',
    );
  });

  it('recurre a `objectName` si falta `dn` (forma alternativa de ldapjs)', () => {
    expect(entryDn({ objectName: 'CN=Ana Gomez,DC=empresa,DC=local' })).toBe('CN=Ana Gomez,DC=empresa,DC=local');
  });
});

describe('readLdapAttribute', () => {
  it('lee un atributo de la forma aplanada `entry.object.<attr>`', () => {
    const entry = { object: { mail: 'jperez@empresa.local', cn: 'Juan Perez' } };
    expect(readLdapAttribute(entry, 'mail')).toBe('jperez@empresa.local');
  });

  it('lee un atributo cuando la forma aplanada lo entrega como array', () => {
    const entry = { object: { mail: ['jperez@empresa.local'] } };
    expect(readLdapAttribute(entry, 'mail')).toBe('jperez@empresa.local');
  });

  it('recurre a la forma `entry.attributes[].values` si falta la aplanada', () => {
    const entry = { attributes: [{ type: 'mail', values: ['jperez@empresa.local'] }] };
    expect(readLdapAttribute(entry, 'mail')).toBe('jperez@empresa.local');
  });

  it('también soporta `entry.attributes[].vals` (nombre usado en algunas versiones)', () => {
    const entry = { attributes: [{ type: 'cn', vals: ['Juan Perez'] }] };
    expect(readLdapAttribute(entry, 'cn')).toBe('Juan Perez');
  });

  it('la búsqueda por tipo de atributo no distingue mayúsculas/minúsculas', () => {
    const entry = { attributes: [{ type: 'sAMAccountName', values: ['jperez'] }] };
    expect(readLdapAttribute(entry, 'samaccountname')).toBe('jperez');
  });

  it('devuelve undefined si el atributo no existe en ninguna forma', () => {
    const entry = { object: {}, attributes: [] };
    expect(readLdapAttribute(entry, 'mail')).toBeUndefined();
  });
});
