import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional, IsBoolean, IsArray, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommissionType } from '../entities/commission-rule.entity';
import { Level } from '../../../common/enums/level.enum';
import { UserRole } from '../../users/enums/user-role.enum';

export class CreateCommissionRuleDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ enum: CommissionType })
    @IsEnum(CommissionType)
    type: CommissionType;

    @ApiProperty({ description: 'Percentage or Fixed Amount' })
    @IsNumber()
    @Min(0)
    value: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsArray()
    tiers?: any[];

    @ApiPropertyOptional({ enum: UserRole, isArray: true })
    @IsOptional()
    @IsArray()
    @IsEnum(UserRole, { each: true })
    roleApplicable?: UserRole[];

    @ApiPropertyOptional({ enum: Level, isArray: true })
    @IsOptional()
    @IsArray()
    @IsEnum(Level, { each: true })
    allowedLevels?: Level[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    productIds?: string[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    stylistIds?: string[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    minOrderAmount?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    maxCommission?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    priority?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    validFrom?: Date;

    @ApiPropertyOptional()
    @IsOptional()
    validUntil?: Date;
}
