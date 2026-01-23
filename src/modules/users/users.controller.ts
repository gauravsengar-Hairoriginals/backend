import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    UseGuards,
    ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, ADMIN_ROLES } from './enums/user-role.enum';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('api/v1/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get()
    @Roles(...ADMIN_ROLES, UserRole.HEAD_ONLINE_SALES, UserRole.HEAD_FIELD_FORCE)
    @ApiOperation({ summary: 'Get all users (admin/heads only)' })
    findAll() {
        return this.usersService.findAll();
    }

    @Get(':id')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Get user by ID' })
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.findById(id);
    }

    @Patch(':id')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Update user' })
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateUserDto: UpdateUserDto,
    ) {
        return this.usersService.update(id, updateUserDto);
    }

    @Post(':id/deactivate')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Deactivate user' })
    deactivate(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.deactivate(id);
    }

    @Post(':id/activate')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Activate user' })
    activate(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.activate(id);
    }

    @Patch(':id/role')
    @Roles(UserRole.SUPER_ADMIN)
    @ApiOperation({ summary: 'Assign role to user (Super Admin only)' })
    @ApiResponse({ status: 200, description: 'Role assigned successfully' })
    @ApiResponse({ status: 403, description: 'Only Super Admin can assign roles' })
    @ApiResponse({ status: 404, description: 'User not found' })
    assignRole(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() assignRoleDto: AssignRoleDto,
    ) {
        return this.usersService.assignRole(id, assignRoleDto.role);
    }
}

