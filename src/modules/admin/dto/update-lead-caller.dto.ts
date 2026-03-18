import { IsString, IsEmail, IsOptional, IsArray, IsEnum } from 'class-validator';
import { CallerCategory } from '../../users/enums/caller-category.enum';

export class UpdateLeadCallerDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsEmail()
    @IsOptional()
    email?: string;

    @IsString()
    @IsOptional()
    phone?: string;

    /** If provided, the caller's password will be updated to this value. */
    @IsString()
    @IsOptional()
    password?: string;

    @IsEnum(CallerCategory)
    @IsOptional()
    callerCategory?: CallerCategory;

    /** List of region codes this caller serves. Empty array = any region. */
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    callerRegions?: string[];
}
