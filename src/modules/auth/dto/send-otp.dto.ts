import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendOtpDto {
    @ApiProperty({ example: '+919876543210', description: 'Phone number with country code' })
    @IsString()
    @IsNotEmpty()
    @Matches(/^\+[1-9]\d{6,14}$/, {
        message: 'Phone number must be in E.164 format (e.g., +919876543210)',
    })
    phone: string;
}
