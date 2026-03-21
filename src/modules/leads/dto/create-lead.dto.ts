import {
    IsString,
    IsOptional,
    IsObject,
    IsPhoneNumber,
    IsIn,
    IsBoolean,
    IsDateString,
    IsArray,
    IsInt,
    IsUUID,
    Min,
    ValidateNested,
    ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CALL_STATUS_OPTIONS, CONSULTATION_TYPE_OPTIONS } from '../entities/lead-record.entity';

// ── Nested DTOs for products ──────────────────────────────────────────────────

export class LeadProductOptionDto {
    @ApiProperty({ example: 'Length' })
    @IsString()
    name: string;

    @ApiProperty({ example: '14 inches' })
    @IsString()
    value: string;
}

export class CreateLeadProductDto {
    @ApiPropertyOptional({ example: 'uuid-of-product' })
    @IsUUID()
    @IsOptional()
    productId?: string;

    @ApiProperty({ example: 'Hair Extension' })
    @IsString()
    productTitle: string;

    @ApiPropertyOptional({ example: 1 })
    @IsInt()
    @Min(1)
    @IsOptional()
    quantity?: number;

    @ApiPropertyOptional({ type: [LeadProductOptionDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LeadProductOptionDto)
    @IsOptional()
    options?: LeadProductOptionDto[];
}

// ── Create ────────────────────────────────────────────────────────────────────
export class CreateLeadDto {
    @ApiPropertyOptional({ example: 'Priya Sharma' })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiProperty({ example: '9876543210' })
    @IsString()
    phone: string;

    @ApiPropertyOptional({ example: 'delhi' })
    @IsString()
    @IsOptional()
    city?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    address?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    pincode?: string;

    @ApiPropertyOptional({ example: 'facebook' })
    @IsString()
    @IsOptional()
    source?: string;

    @ApiPropertyOptional({ example: 'campaign' })
    @IsString()
    @IsOptional()
    pageType?: string;

    @ApiPropertyOptional({ example: 'SUMMER25' })
    @IsString()
    @IsOptional()
    campaignId?: string;

    @ApiPropertyOptional({ example: 'EC', enum: ['EC', 'HT', 'WEBSITE', 'POPIN'] })
    @IsIn(['EC', 'HT', 'WEBSITE', 'POPIN'])
    @IsOptional()
    leadCategory?: string;

    @ApiPropertyOptional({ example: { utm_term: 'hair care' } })
    @IsObject()
    @IsOptional()
    specificDetails?: Record<string, any>;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    notes?: string;

    @ApiPropertyOptional({ type: [CreateLeadProductDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateLeadProductDto)
    @IsOptional()
    products?: CreateLeadProductDto[];

    @ApiPropertyOptional({ example: 'Delhi HO' })
    @IsString()
    @IsOptional()
    preferredExperienceCenter?: string;


    @ApiPropertyOptional({ example: 'Hair Extensions, Wigs' })
    @IsOptional()
    preferredProducts?: any;

    @ApiPropertyOptional({ example: 'Try at Home' })
    @IsString()
    @IsOptional()
    formType?: string;

    @ApiPropertyOptional({ example: '3522' })
    @IsOptional()
    productId?: any;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    utm_campaign?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    utm_content?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    utm_medium?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    utm_source?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    utm_term?: string;

    @ApiPropertyOptional({ example: 'Wig Consultation' })
    @IsIn([...CONSULTATION_TYPE_OPTIONS])
    @IsOptional()
    consultationType?: string;

    @ApiPropertyOptional()
    @IsBoolean()
    @IsOptional()
    appointmentBooked?: boolean;

    @ApiPropertyOptional({ example: '2026-03-01' })
    @Transform(({ value }) => value === '' ? undefined : value)
    @ValidateIf(o => o.bookedDate != null)
    @IsDateString()
    @IsOptional()
    bookedDate?: string;

    @ApiPropertyOptional({ example: '10:00 AM' })
    @IsString()
    @IsOptional()
    bookedTimeSlot?: string;

    @ApiPropertyOptional({ example: '2026-03-01' })
    @Transform(({ value }) => value === '' ? undefined : value)
    @ValidateIf(o => o.nextActionDate != null)
    @IsDateString()
    @IsOptional()
    nextActionDate?: string;
}

// ── Update Lead Record (caller tracking fields) ───────────────────────────────
export class UpdateLeadRecordDto {
    // Basic info editable
    @IsString() @IsOptional() name?: string;
    @IsString() @IsOptional() phone?: string;
    @IsString() @IsOptional() city?: string;
    @IsString() @IsOptional() address?: string;
    @IsString() @IsOptional() pincode?: string;
    @IsString() @IsOptional() notes?: string;
    @IsString() @IsOptional() source?: string;
    @IsString() @IsOptional() pageType?: string;
    @IsString() @IsOptional() campaignId?: string;
    @IsIn(['EC', 'HT', 'WEBSITE', 'POPIN']) @IsOptional() leadCategory?: string;
    @IsObject() @IsOptional() specificDetails?: Record<string, any>;

    // Calling fields
    @IsIn(CALL_STATUS_OPTIONS) @IsOptional() call1?: string;
    @IsIn(CALL_STATUS_OPTIONS) @IsOptional() call2?: string;
    @IsIn(CALL_STATUS_OPTIONS) @IsOptional() call3?: string;
    @IsString() @IsOptional() remarks?: string;

    // Appointment
    @IsBoolean() @IsOptional() appointmentBooked?: boolean;
    @Transform(({ value }) => value === '' ? undefined : value)
    @ValidateIf(o => o.bookedDate != null)
    @IsDateString() @IsOptional() bookedDate?: string;
    @IsString() @IsOptional() bookedTimeSlot?: string;

    // Preferences
    @IsString() @IsOptional() preferredExperienceCenter?: string;
    @IsString() @IsOptional() customerProductInterest?: string;
    @IsIn([...CONSULTATION_TYPE_OPTIONS]) @IsOptional() consultationType?: string;
    @Transform(({ value }) => value === '' ? undefined : value)
    @ValidateIf(o => o.nextActionDate != null)
    @IsDateString() @IsOptional() nextActionDate?: string;

    // Products (Two-Layer)
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateLeadProductDto)
    @IsOptional()
    products?: CreateLeadProductDto[];

    // Status
    @IsIn(['new', 'contacted', 'converted:Marked to EC', 'converted:Marked to HT', 'converted:Marked to VC', 'dropped'])
    @IsOptional()
    status?: string;
}

// ── Assign ────────────────────────────────────────────────────────────────────
export class AssignLeadDto {
    @ApiProperty({ example: 'uuid-of-lead-caller' })
    @IsString()
    callerId: string;
}

// ── Bulk Assign ───────────────────────────────────────────────────────────────
export class BulkAssignLeadDto {
    @ApiProperty({ example: ['uuid-1', 'uuid-2'] })
    @IsArray()
    @IsString({ each: true })
    leadIds: string[];

    @ApiProperty({ example: 'uuid-of-lead-caller' })
    @IsString()
    callerId: string;
}
