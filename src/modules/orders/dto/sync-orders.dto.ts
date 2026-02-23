
import { IsISO8601, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SyncOrdersDto {
    @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Start date for sync (ISO 8601)' })
    @IsNotEmpty()
    @IsISO8601()
    startDate: string;

    @ApiProperty({ example: '2024-01-31T23:59:59Z', description: 'End date for sync (ISO 8601)' })
    @IsNotEmpty()
    @IsISO8601()
    endDate: string;
}
