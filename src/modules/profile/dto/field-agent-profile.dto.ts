import { IsString, IsOptional, IsEnum, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum VehicleType {
    BIKE = 'BIKE',
    CAR = 'CAR',
    SCOOTER = 'SCOOTER',
}

export class FieldAgentProfileDto {
    @ApiPropertyOptional({ enum: VehicleType, example: VehicleType.BIKE })
    @IsEnum(VehicleType)
    @IsOptional()
    vehicleType?: VehicleType;

    @ApiPropertyOptional({ example: 'MH01AB1234' })
    @IsString()
    @IsOptional()
    vehicleNumber?: string;

    @ApiPropertyOptional({ example: '+919876543210', description: 'Emergency contact number' })
    @IsString()
    @IsOptional()
    @Matches(/^\+[1-9]\d{6,14}$/, {
        message: 'Emergency contact must be in E.164 format',
    })
    emergencyContact?: string;

    @ApiPropertyOptional({ example: '1234567890123456' })
    @IsString()
    @IsOptional()
    @Matches(/^\d{9,18}$/, { message: 'Invalid bank account number' })
    bankAccountNumber?: string;

    @ApiPropertyOptional({ example: 'HDFC0001234' })
    @IsString()
    @IsOptional()
    @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, { message: 'Invalid IFSC code' })
    bankIfsc?: string;

    @ApiPropertyOptional({ example: 'John Doe' })
    @IsString()
    @IsOptional()
    bankAccountHolder?: string;

    @ApiPropertyOptional({ example: 'ABCDE1234F' })
    @IsString()
    @IsOptional()
    @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, { message: 'Invalid PAN number' })
    panNumber?: string;
}
