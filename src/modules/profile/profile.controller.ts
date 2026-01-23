import {
    Controller,
    Get,
    Patch,
    Body,
    UseGuards,
    ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import { UpdateProfileDto, StylistProfileDto, FieldAgentProfileDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('Profile')
@Controller('api/v1/profile')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProfileController {
    constructor(private readonly profileService: ProfileService) { }

    @Get()
    @ApiOperation({ summary: 'Get current user profile' })
    @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getProfile(@CurrentUser() user: any) {
        return this.profileService.getProfile(user.id);
    }

    @Patch()
    @ApiOperation({ summary: 'Update profile (common fields)' })
    @ApiResponse({ status: 200, description: 'Profile updated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async updateProfile(
        @CurrentUser() user: any,
        @Body() updateProfileDto: UpdateProfileDto,
    ) {
        return this.profileService.updateProfile(user.id, updateProfileDto);
    }

    @Patch('stylist')
    @ApiOperation({ summary: 'Update stylist-specific profile fields' })
    @ApiResponse({ status: 200, description: 'Stylist profile updated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden - Stylist role required' })
    async updateStylistProfile(
        @CurrentUser() user: any,
        @Body() stylistProfileDto: StylistProfileDto,
    ) {
        if (user.role !== UserRole.STYLIST) {
            throw new ForbiddenException('Only stylists can update stylist profile fields');
        }
        return this.profileService.updateStylistProfile(user.id, stylistProfileDto);
    }

    @Patch('field-agent')
    @ApiOperation({ summary: 'Update field agent-specific profile fields' })
    @ApiResponse({ status: 200, description: 'Field agent profile updated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden - Field Agent role required' })
    async updateFieldAgentProfile(
        @CurrentUser() user: any,
        @Body() fieldAgentProfileDto: FieldAgentProfileDto,
    ) {
        if (user.role !== UserRole.FIELD_AGENT) {
            throw new ForbiddenException('Only field agents can update field agent profile fields');
        }
        return this.profileService.updateFieldAgentProfile(user.id, fieldAgentProfileDto);
    }
}
