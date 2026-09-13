import { ArrayMinSize, IsArray, IsIn, IsString, MinLength } from 'class-validator';

/**
 * Payload que `services/ai-service` envía al detectar un posible incidente masivo
 * (plan `2.txt`, módulo 4 — Detección de Anomalías / Clusterización). Ver
 * `ai-service/app/modules/anomaly/detector.py`.
 */
export class AnomalyAlertDto {
  @IsString()
  @MinLength(3)
  clusterLabel!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ticketCodes!: string[];

  @IsIn(['warning', 'critical'])
  severity!: 'warning' | 'critical';
}
