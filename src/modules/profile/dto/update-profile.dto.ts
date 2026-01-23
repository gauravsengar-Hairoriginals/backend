import { IsString, IsOptional, IsUrl } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
    @ApiPropertyOptional({ example: 'John Doe' })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg' })
    @IsUrl()
    @IsOptional()
    avatar?: string;

    @ApiPropertyOptional({ example: '123 Main Street, Apartment 4B' })
    @IsString()
    @IsOptional()
    address?: string;

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
}
