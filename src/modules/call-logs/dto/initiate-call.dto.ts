import { IsString, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitiateCallDto {
    @ApiProperty({ example: 'uuid-of-lead-record' })
    @IsUUID()
    leadId: string;

    @ApiProperty({ example: 'uuid-of-customer' })
    @IsUUID()
    customerId: string;

    @ApiProperty({ example: '9876543210' })
    @IsString()
    agentNumber: string;

    @ApiProperty({ example: '9123456789' })
    @IsString()
    callerNumber: string;

    @ApiPropertyOptional({ example: 'uuid-of-agent-user' })
    @IsUUID()
    @IsOptional()
    agentId?: string;
}
