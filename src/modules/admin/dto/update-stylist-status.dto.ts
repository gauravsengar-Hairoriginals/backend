import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateStylistStatusDto {
    @IsBoolean()
    isApproved: boolean;

    @IsString()
    @IsOptional()
    rejectionReason?: string;
}
