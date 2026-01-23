import { IsString, IsArray, IsOptional, IsNumber, IsBoolean, ValidateNested, IsUUID, ArrayMinSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class AddressDto {
    @ApiPropertyOptional({ example: 'John' })
    @IsString()
    @IsOptional()
    firstName?: string;

    @ApiPropertyOptional({ example: 'Doe' })
    @IsString()
    @IsOptional()
    lastName?: string;

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

    @ApiPropertyOptional({ example: '+919876543210' })
    @IsString()
    @IsOptional()
    phone?: string;
}

class LineItemDto {
    @ApiProperty({ example: '12345678901', description: 'Shopify variant ID' })
    @IsString()
    variantId: string;

    @ApiProperty({ example: 2 })
    @IsNumber()
    quantity: number;

    @ApiPropertyOptional({ example: 4500.00, description: 'Override price (optional)' })
    @IsNumber()
    @IsOptional()
    price?: number;

    @ApiPropertyOptional({ example: [{ name: 'Gift Message', value: 'Happy Birthday!' }] })
    @IsArray()
    @IsOptional()
    properties?: Record<string, string>[];
}

export class CreateOrderDto {
    @ApiProperty({ description: 'Customer UUID in HO-Backend' })
    @IsUUID()
    customerId: string;

    @ApiProperty({ type: [LineItemDto], description: 'Order line items' })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => LineItemDto)
    lineItems: LineItemDto[];

    @ApiPropertyOptional({ type: [String], example: ['SUMMER20'] })
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    discountCodes?: string[];

    @ApiPropertyOptional({ type: AddressDto })
    @ValidateNested()
    @Type(() => AddressDto)
    @IsOptional()
    shippingAddress?: AddressDto;

    @ApiPropertyOptional({ type: AddressDto })
    @ValidateNested()
    @Type(() => AddressDto)
    @IsOptional()
    billingAddress?: AddressDto;

    @ApiPropertyOptional({ example: 'Please wrap as gift' })
    @IsString()
    @IsOptional()
    note?: string;

    @ApiPropertyOptional({ type: [String], example: ['vip', 'priority'] })
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    tags?: string[];

    @ApiPropertyOptional({ example: false, default: false })
    @IsBoolean()
    @IsOptional()
    sendReceipt?: boolean;

    @ApiPropertyOptional({ example: 'mobile-app' })
    @IsString()
    @IsOptional()
    source?: string;
}
