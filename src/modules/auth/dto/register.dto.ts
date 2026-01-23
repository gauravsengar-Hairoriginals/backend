import {
    IsEmail,
    IsNotEmpty,
    IsString,
    MinLength,
    IsEnum,
    IsOptional,
    Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../users/enums/user-role.enum';

export class RegisterDto {
    @ApiProperty({ example: 'admin@hairoriginals.com' })
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiProperty({ example: 'password123' })
    @IsString()
    @IsNotEmpty()
    @MinLength(8)
    password: string;

    @ApiProperty({ example: 'John Doe' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: '+919876543210', description: 'Phone number with country code (mandatory)' })
    @IsString()
    @IsNotEmpty()
    @Matches(/^\+[1-9]\d{6,14}$/, {
        message: 'Phone number must be in E.164 format (e.g., +919876543210)',
    })
    phone: string;

    @ApiProperty({ enum: UserRole, example: UserRole.SALES_EXECUTIVE })
    @IsEnum(UserRole)
    @IsNotEmpty()
    role: UserRole;

    @ApiPropertyOptional({ example: 'sales' })
    @IsString()
    @IsOptional()
    department?: string;
}
