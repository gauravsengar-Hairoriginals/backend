import { IsString, IsNumber, IsOptional, IsEnum, Min, Max, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiscountType } from '../entities/discount-code.entity';

export class CreateDiscountDto {
    @ApiProperty({ example: '+919876543210', description: 'Customer phone number' })
    @IsString()
    customerPhone: string;

    @ApiProperty({ enum: DiscountType, example: DiscountType.PERCENTAGE })
    @IsEnum(DiscountType)
    type: DiscountType;

    @ApiProperty({ example: 20, description: 'Value (20 for 20% or 500 for ₹500)' })
    @IsNumber()
    @Min(0)
    value: number;

    @ApiProperty({ example: 30, description: 'Validity in days' })
    @IsNumber()
    @Min(1)
    @Max(365)
    validityDays: number;

    @ApiPropertyOptional({ example: '12345678901', description: 'Shopify product ID (optional)' })
    @IsString()
    @IsOptional()
    shopifyProductId?: string;

    @ApiPropertyOptional({ example: '12345678902', description: 'Shopify variant ID (optional)' })
    @IsString()
    @IsOptional()
    shopifyVariantId?: string;

    @ApiPropertyOptional({ example: 1, description: 'Number of times coupon can be used (default: 1)' })
    @IsNumber()
    @IsOptional()
    usageLimit?: number;

    @ApiPropertyOptional({ example: true, default: true })
    @IsBoolean()
    @IsOptional()
    oncePerCustomer?: boolean;

    @ApiPropertyOptional({ example: 1000, description: 'Minimum order amount' })
    @IsNumber()
    @IsOptional()
    minimumAmount?: number;

    @ApiPropertyOptional({ example: 'Birthday discount for you!' })
    @IsString()
    @IsOptional()
    note?: string;
}
