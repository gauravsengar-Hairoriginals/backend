import { IsString, IsOptional, IsEnum, IsBoolean, IsEmail, Matches, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum CustomerScope {
    LOCAL = 'local',
    GLOBAL = 'global',
}

class AddressDto {
    @ApiPropertyOptional({ example: '123 Main Street' })
    @IsString()
    @IsOptional()
    address1?: string;

    @ApiPropertyOptional({ example: 'Apt 4B' })
    @IsString()
    @IsOptional()
    address2?: string;

    @ApiPropertyOptional({ example: 'Mumbai' })
    @IsString()
    @IsOptional()
    city?: string;

    @ApiPropertyOptional({ example: 'Maharashtra' })
    @IsString()
    @IsOptional()
    state?: string;

    @ApiPropertyOptional({ example: '400001' })
    @IsString()
    @IsOptional()
    pincode?: string;

    @ApiPropertyOptional({ example: 'India', default: 'India' })
    @IsString()
    @IsOptional()
    country?: string;
}

export class CreateCustomerDto {
    @ApiProperty({ example: '+919876543210', description: 'Phone in E.164 format' })
    @IsString()
    @Matches(/^\+[1-9]\d{6,14}$/, { message: 'Phone must be in E.164 format' })
    phone: string;

    @ApiPropertyOptional({ example: 'john@example.com' })
    @IsEmail()
    @IsOptional()
    email?: string;

    @ApiPropertyOptional({ example: 'John' })
    @IsString()
    @IsOptional()
    firstName?: string;

    @ApiPropertyOptional({ example: 'Doe' })
    @IsString()
    @IsOptional()
    lastName?: string;

    @ApiPropertyOptional({ example: false })
    @IsBoolean()
    @IsOptional()
    acceptsMarketing?: boolean;

    @ApiPropertyOptional({ type: [String], example: ['vip', 'newsletter'] })
    @IsString({ each: true })
    @IsOptional()
    tags?: string[];

    @ApiPropertyOptional({ example: 'VIP customer from referral' })
    @IsString()
    @IsOptional()
    note?: string;

    @ApiPropertyOptional({ type: AddressDto })
    @ValidateNested()
    @Type(() => AddressDto)
    @IsOptional()
    address?: AddressDto;

    @ApiPropertyOptional({
        enum: CustomerScope,
        default: CustomerScope.LOCAL,
        description: 'local = HO-Backend only, global = also create in Shopify',
    })
    @IsEnum(CustomerScope)
    @IsOptional()
    scope?: CustomerScope;
}
