import { IsString, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PopinPropertiesDto {
    @IsString() @IsOptional() customer_name?: string;
    @IsString() @IsOptional() customer_email?: string;
    @IsString() @IsOptional() customer_country_code?: string;
    @IsString() @IsOptional() customer_phone_number?: string;
    @IsString() @IsOptional() call_duration?: string;
    @IsString() @IsOptional() url?: string;
    @IsString() @IsOptional() agent_name?: string;
    @IsString() @IsOptional() agent_email?: string;
    @IsString() @IsOptional() product?: string;
    @IsString() @IsOptional() remark?: string;
    @IsOptional() rating?: number;
    @IsString() @IsOptional() comments?: string;
    @IsString() @IsOptional() scheduled_time?: string;
    @IsString() @IsOptional() scheduled_date?: string;
    @IsString() @IsOptional() scheduled_time_local?: string;
    @IsString() @IsOptional() scheduled_date_local?: string;
    @IsObject() @IsOptional() meta?: Record<string, any>;
    @IsObject() @IsOptional() extra?: Record<string, any>;
}

export class PopinWebhookDto {
    @IsString()
    event: string;

    @IsString() @IsOptional() user_id?: string;
    @IsString() @IsOptional() email?: string;
    @IsString() @IsOptional() country_code?: string;
    @IsString() @IsOptional() phone_number?: string;
    @IsString() @IsOptional() full_phone_number?: string;
    @IsString() @IsOptional() timestamp?: string;

    // Guest connected specific fields
    @IsString() @IsOptional() guest_type?: string;
    @IsString() @IsOptional() guest_id?: string;
    @IsString() @IsOptional() guest_agent_name?: string;
    @IsString() @IsOptional() guest_agent_email?: string;

    @IsOptional()
    meta?: any;

    @ValidateNested()
    @Type(() => PopinPropertiesDto)
    @IsOptional()
    properties?: PopinPropertiesDto;
}
