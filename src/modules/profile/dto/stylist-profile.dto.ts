import { IsString, IsOptional, IsNumber, IsArray, Min, Max, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class StylistProfileDto {
    @ApiPropertyOptional({ example: 'Glamour Salon' })
    @IsString()
    @IsOptional()
    salonName?: string;

    @ApiPropertyOptional({ example: '456 Fashion Street' })
    @IsString()
    @IsOptional()
    salonAddress?: string;

    @ApiPropertyOptional({ example: 'Delhi' })
    @IsString()
    @IsOptional()
    salonCity?: string;

    @ApiPropertyOptional({ example: '110001' })
    @IsString()
    @IsOptional()
    salonPincode?: string;

    @ApiPropertyOptional({ example: 5 })
    @IsNumber()
    @IsOptional()
    @Min(0)
    @Max(50)
    yearsOfExperience?: number;

    @ApiPropertyOptional({ example: ['Hair Extensions', 'Coloring', 'Styling'] })
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    specializations?: string[];

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
