import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../enums/user-role.enum';

export class AssignRoleDto {
    @ApiProperty({ enum: UserRole, example: UserRole.SALES_EXECUTIVE, description: 'New role to assign' })
    @IsEnum(UserRole)
    @IsNotEmpty()
    role: UserRole;
}
