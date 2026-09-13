import { IsString, MinLength } from 'class-validator';

/** A diferencia de `LoginDto`, `username` no se valida como email — en AD/LDAP
 * el login suele ser el `sAMAccountName` (ej. "jperez"), no el correo. */
export class LdapLoginDto {
  @IsString()
  @MinLength(1)
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
