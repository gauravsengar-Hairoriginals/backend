import { IsNotEmpty, IsString, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
    @ApiProperty({ example: '+919876543210', description: 'Phone number with country code' })
    @IsString()
    @IsNotEmpty()
    @Matches(/^\+[1-9]\d{6,14}$/, {
        message: 'Phone number must be in E.164 format (e.g., +919876543210)',
    })
    phone: string;

    @ApiProperty({ example: '123456', description: '6-digit OTP' })
    @IsString()
    @IsNotEmpty()
    @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
    @Matches(/^\d{6}$/, { message: 'OTP must contain only digits' })
    otp: string;
}
