import { IsString, IsOptional, IsUUID, IsNumber, IsEnum, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Level } from '../../../common/enums/level.enum';
import { SalonStage } from '../../../common/enums/salon-stage.enum';

export class CreateSalonDto {
    @ApiProperty({ description: 'Salon name' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Salon owner name' })
    @IsString()
    ownerName: string;

    @ApiProperty({ description: 'Salon owner phone number' })
    @IsString()
    ownerPhone: string;

    @ApiPropertyOptional({ description: 'Salon manager name' })
    @IsOptional()
    @IsString()
    managerName?: string;

    @ApiPropertyOptional({ description: 'Salon manager phone number' })
    @IsOptional()
    @IsString()
    managerPhone?: string;

    @ApiPropertyOptional({ description: 'Salon address' })
    @IsOptional()
    @IsString()
    address?: string;

    @ApiPropertyOptional({ description: 'City' })
    @IsOptional()
    @IsString()
    city?: string;

    @ApiPropertyOptional({ description: 'State' })
    @IsOptional()
    @IsString()
    state?: string;

    @ApiPropertyOptional({ description: 'Pincode' })
    @IsOptional()
    @IsString()
    pincode?: string;

    @ApiPropertyOptional({ description: 'GPS Latitude' })
    @IsOptional()
    @IsNumber()
    latitude?: number;

    @ApiPropertyOptional({ description: 'GPS Longitude' })
    @IsOptional()
    @IsNumber()
    longitude?: number;

    @ApiProperty({ enum: Level, default: Level.SILVER })
    @IsEnum(Level)
    @IsOptional()
    level?: Level;

    @ApiPropertyOptional({ enum: SalonStage, default: SalonStage.APPROACH })
    @IsEnum(SalonStage)
    @IsOptional()
    stage?: SalonStage;
}

export class UpdateSalonDto {
    @ApiPropertyOptional({ description: 'Salon name' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiProperty({ enum: Level })
    @IsEnum(Level)
    @IsOptional()
    level?: Level;

    @ApiPropertyOptional({ description: 'Salon owner name' })
    @IsOptional()
    @IsString()
    ownerName?: string;

    @ApiPropertyOptional({ description: 'Salon owner phone number' })
    @IsOptional()
    @IsString()
    ownerPhone?: string;

    @ApiPropertyOptional({ description: 'Salon manager name' })
    @IsOptional()
    @IsString()
    managerName?: string;

    @ApiPropertyOptional({ description: 'Salon manager phone number' })
    @IsOptional()
    @IsString()
    managerPhone?: string;

    @ApiPropertyOptional({ description: 'Salon address' })
    @IsOptional()
    @IsString()
    address?: string;

    @ApiPropertyOptional({ description: 'City' })
    @IsOptional()
    @IsString()
    city?: string;

    @ApiPropertyOptional({ description: 'State' })
    @IsOptional()
    @IsString()
    state?: string;

    @ApiPropertyOptional({ description: 'Pincode' })
    @IsOptional()
    @IsString()
    pincode?: string;

    @ApiPropertyOptional({ description: 'GPS Latitude' })
    @IsOptional()
    @IsNumber()
    latitude?: number;

    @ApiPropertyOptional({ description: 'GPS Longitude' })
    @IsOptional()
    @IsNumber()
    longitude?: number;

    @ApiPropertyOptional({ enum: SalonStage })
    @IsEnum(SalonStage)
    @IsOptional()
    stage?: SalonStage;

    @ApiPropertyOptional({ description: 'Checklist updates' })
    @IsOptional()
    @IsObject()
    checklist?: Record<string, boolean>;
}

export class AddStylistToSalonDto {
    @ApiProperty({ description: 'Stylist user ID to add to salon' })
    @IsUUID()
    @IsOptional()
    stylistId?: string;

    @ApiPropertyOptional({ description: 'Stylist phone number to add (creates user if missing)' })
    @IsOptional()
    @IsString()
    phone?: string;

    @ApiPropertyOptional({ description: 'Stylist name (used if creating new user)' })
    @IsOptional()
    @IsString()
    name?: string;
}
