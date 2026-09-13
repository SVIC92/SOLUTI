import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ldap from 'ldapjs';
import { buildLdapSearchFilter } from './ldap-filter.util.js';
import { entryDn, readLdapAttribute } from './ldap-entry.util.js';
import type { LdapEntryLike } from './ldap-entry.util.js';

export interface LdapAuthenticatedUser {
  /** DN completo (Distinguished Name) — no se usa como externalId porque puede
   * cambiar si el usuario se mueve de OU; solo sirve para el segundo bind. */
  dn: string;
  /** Identificador estable del usuario en el directorio (sAMAccountName/uid) —
   * este es el `externalId` que se persiste en `User`. */
  uid: string;
  email: string;
  fullName: string;
}

/**
 * Cliente LDAP/AD para el SSO del plan `1.txt` ("integración con Active
 * Directory / LDAP para inicio de sesión único"). Usa el flujo estándar
 * *search-then-bind*: se autentica primero con una cuenta de servicio de solo
 * lectura para ENCONTRAR el DN del usuario (su login no siempre es su DN
 * completo, sobre todo en AD), y luego intenta un segundo bind con ese DN y la
 * contraseña ingresada — si ese segundo bind falla, las credenciales son
 * inválidas. Nunca se guarda ni se compara la contraseña localmente.
 *
 * ⚠️ No se pudo probar contra un servidor AD/LDAP real en este entorno de
 * desarrollo (sin acceso de red a un directorio). La lógica de bind/búsqueda
 * sigue el protocolo documentado de `ldapjs`, pero antes de usarse en
 * producción se recomienda validar `readAttribute()` contra el formato real
 * de atributos que devuelva el directorio del cliente.
 */
@Injectable()
export class LdapClientService {
  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return !!this.config.get<string>('LDAP_URL');
  }

  async authenticate(username: string, password: string): Promise<LdapAuthenticatedUser> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('El inicio de sesión SSO (AD/LDAP) no está configurado en este despliegue');
    }

    const url = this.config.getOrThrow<string>('LDAP_URL');
    const searchBase = this.config.getOrThrow<string>('LDAP_SEARCH_BASE');
    const filterTemplate = this.config.get<string>('LDAP_SEARCH_FILTER') ?? '(sAMAccountName={{username}})';
    const bindDn = this.config.getOrThrow<string>('LDAP_BIND_DN');
    const bindPassword = this.config.getOrThrow<string>('LDAP_BIND_PASSWORD');
    const rejectUnauthorized = this.config.get<string>('LDAP_TLS_REJECT_UNAUTHORIZED') !== 'false';

    const serviceClient = this.createClient(url, rejectUnauthorized);
    try {
      await this.bind(serviceClient, bindDn, bindPassword);

      const filter = buildLdapSearchFilter(filterTemplate, username);
      const entry = await this.searchOne(serviceClient, searchBase, filter);
      if (!entry) {
        throw new UnauthorizedException('Credenciales inválidas');
      }

      const dn = entryDn(entry);
      const userClient = this.createClient(url, rejectUnauthorized);
      try {
        await this.bind(userClient, dn, password);
      } finally {
        userClient.unbind();
      }

      const uid = readLdapAttribute(entry, 'sAMAccountName') ?? readLdapAttribute(entry, 'uid') ?? dn;
      return {
        dn,
        uid,
        email: readLdapAttribute(entry, 'mail') ?? `${uid}@directory.local`,
        fullName: readLdapAttribute(entry, 'displayName') ?? readLdapAttribute(entry, 'cn') ?? uid,
      };
    } finally {
      serviceClient.unbind();
    }
  }

  private createClient(url: string, rejectUnauthorized: boolean): ldap.Client {
    return ldap.createClient({
      url,
      timeout: 5000,
      connectTimeout: 5000,
      tlsOptions: { rejectUnauthorized },
    });
  }

  private bind(client: ldap.Client, dn: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Un bind con contraseña vacía puede ser aceptado por algunos servidores
      // como "bind anónimo exitoso" — nunca debe tratarse como login válido.
      if (!password) {
        reject(new UnauthorizedException('Credenciales inválidas'));
        return;
      }
      client.bind(dn, password, (err) => {
        if (err) reject(new UnauthorizedException('Credenciales inválidas'));
        else resolve();
      });
    });
  }

  private searchOne(client: ldap.Client, base: string, filter: string): Promise<LdapEntryLike | null> {
    return new Promise((resolve, reject) => {
      client.search(base, { filter, scope: 'sub' }, (err, res) => {
        if (err) {
          reject(new ServiceUnavailableException('No se pudo consultar el directorio LDAP/AD'));
          return;
        }

        let found: LdapEntryLike | null = null;
        res.on('searchEntry', (entry: unknown) => {
          if (!found) found = entry as LdapEntryLike;
        });
        res.on('error', () => reject(new ServiceUnavailableException('No se pudo consultar el directorio LDAP/AD')));
        res.on('end', () => resolve(found));
      });
    });
  }

}
