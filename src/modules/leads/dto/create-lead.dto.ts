import {
    IsString,
    IsOptional,
    IsObject,
    IsPhoneNumber,
    IsIn,
    IsBoolean,
    IsDateString,
    ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CALL_STATUS_OPTIONS, TIME_SLOT_OPTIONS } from '../entities/lead-record.entity';

// ── Create ────────────────────────────────────────────────────────────────────
export class CreateLeadDto {
    @ApiProperty({ example: 'Priya Sharma' })
    @IsString()
    name: string;

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

    @ApiPropertyOptional({ example: { utm_term: 'hair care' } })
    @IsObject()
    @IsOptional()
    specificDetails?: Record<string, any>;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    notes?: string;
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
    @IsObject() @IsOptional() specificDetails?: Record<string, any>;

    // Calling fields
    @IsIn(CALL_STATUS_OPTIONS) @IsOptional() call1?: string;
    @IsIn(CALL_STATUS_OPTIONS) @IsOptional() call2?: string;
    @IsIn(CALL_STATUS_OPTIONS) @IsOptional() call3?: string;
    @IsString() @IsOptional() remarks?: string;

    // Scheduling
    @IsBoolean() @IsOptional() scheduled?: boolean;
    @Transform(({ value }) => value === '' ? undefined : value)
    @ValidateIf(o => o.selectedDate != null)
    @IsDateString() @IsOptional() selectedDate?: string;
    @IsIn(TIME_SLOT_OPTIONS) @IsOptional() timeSlot?: string;

    // Appointment
    @IsBoolean() @IsOptional() appointmentBooked?: boolean;
    @Transform(({ value }) => value === '' ? undefined : value)
    @ValidateIf(o => o.bookedDate != null)
    @IsDateString() @IsOptional() bookedDate?: string;

    // Preferences
    @IsString() @IsOptional() preferredExperienceCenter?: string;
    @Transform(({ value }) => value === '' ? undefined : value)
    @ValidateIf(o => o.nextActionDate != null)
    @IsDateString() @IsOptional() nextActionDate?: string;
    @IsOptional() preferredProducts?: string[];
    @IsOptional() preferredProductOptions?: Record<string, Record<string, string>>;

    // Status
    @IsIn(['new', 'contacted', 'follow_up', 'converted', 'not_interested'])
    @IsOptional()
    status?: string;
}

// ── Assign ────────────────────────────────────────────────────────────────────
export class AssignLeadDto {
    @ApiProperty({ example: 'uuid-of-lead-caller' })
    @IsString()
    callerId: string;
}
