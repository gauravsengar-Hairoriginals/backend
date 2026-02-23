import { IsEmail, IsString, MinLength, IsEnum, IsOptional, IsArray, IsPhoneNumber } from 'class-validator';

export class CreateAdminDto {
    @IsEmail()
    email: string;

    @IsString()
    name: string;

    @IsPhoneNumber('IN') // Assuming India
    phone: string;

    @IsString()
    @MinLength(8)
    password: string;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    permissions?: string[];
}
