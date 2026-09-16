import { IsString, MinLength } from 'class-validator';

export class UpdateSupportGroupDto {
  @IsString()
  @MinLength(2)
  name!: string;
}
