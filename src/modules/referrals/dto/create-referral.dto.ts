import { IsString, IsNumber, IsOptional, IsEnum, Min, Max, ValidateNested, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { DiscountType } from '../../discounts/entities/discount-code.entity';

class AddressDto {
    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    address1?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    address2?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    city?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    state?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    pincode?: string;
}

export class CreateReferralDto {
    @ApiProperty({ example: '+919876543210', description: 'Customer phone number (mandatory)' })
    @IsString()
    customerPhone: string;

    @ApiPropertyOptional({ example: 'John Doe', description: 'Customer name (optional)' })
    @IsString()
    @IsOptional()
    customerName?: string;

    @ApiPropertyOptional({ type: AddressDto, description: 'Customer address (optional)' })
    @ValidateNested()
    @Type(() => AddressDto)
    @IsOptional()
    customerAddress?: AddressDto;

    @ApiPropertyOptional({ example: '12345678901', description: 'Shopify product ID (optional)' })
    @IsString()
    @IsOptional()
    shopifyProductId?: string;

    @ApiPropertyOptional({ enum: DiscountType, default: DiscountType.PERCENTAGE })
    @IsEnum(DiscountType)
    @IsOptional()
    discountType?: DiscountType;

    @ApiPropertyOptional({ example: 20, default: 20, description: 'Discount value (20 for 20%)' })
    @IsNumber()
    @Min(0)
    @IsOptional()
    discountValue?: number;

    @ApiPropertyOptional({ example: 30, default: 30, description: 'Validity in days' })
    @IsNumber()
    @Min(1)
    @Max(365)
    @IsOptional()
    validityDays?: number;

    @ApiPropertyOptional({ example: 'Birthday discount' })
    @IsString()
    @IsOptional()
    note?: string;
}
