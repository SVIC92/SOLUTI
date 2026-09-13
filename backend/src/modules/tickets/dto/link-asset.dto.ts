import { IsUUID } from 'class-validator';

export class LinkAssetDto {
  @IsUUID()
  assetId!: string;
}
