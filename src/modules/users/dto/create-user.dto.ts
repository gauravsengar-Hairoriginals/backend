import { IsEmail, IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../enums/user-role.enum';

export class CreateUserDto {
    @ApiPropertyOptional()
    @IsEmail()
    @IsOptional()
    email?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    phone?: string;

    @ApiPropertyOptional()
    @IsString()
    name: string;

    @ApiPropertyOptional({ enum: UserRole })
    @IsEnum(UserRole)
    @IsOptional()
    role?: UserRole;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    department?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    reportsToId?: string;
}
