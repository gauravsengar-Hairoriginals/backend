import { IsArray, IsString } from 'class-validator';

export class BulkCreditReferralsDto {
    @IsArray()
    @IsString({ each: true })
    referralIds: string[];
}
