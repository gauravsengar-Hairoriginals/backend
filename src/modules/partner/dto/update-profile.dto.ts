import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileDto {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    bankAccountNumber?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    bankAccountName?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    bankIFSC?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    bankName?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    upiPhone?: string;
}
