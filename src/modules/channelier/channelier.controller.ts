import { Controller, Post, Get, UseGuards } from '@nestjs/common';
import { ChannelierService } from './channelier.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@Controller('api/v1/channelier')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class ChannelierController {
    constructor(private readonly channelierService: ChannelierService) {}

    /**
     * Admin-only endpoint to test / warm up the Channelier auth token.
     * Useful for verifying credentials without making a business API call.
     * POST /api/v1/channelier/auth/test
     */
    @Post('auth/test')
    async testAuth() {
        const token = await this.channelierService.getToken();
        return {
            success: true,
            message: 'Channelier auth token obtained successfully',
            tokenPreview: `${token.substring(0, 20)}…`,
        };
    }

    /**
     * Returns the current cache status (does not force a refresh).
     * GET /api/v1/channelier/auth/status
     */
    @Get('auth/status')
    async authStatus() {
        // A lightweight call — just check if a token can be retrieved
        try {
            const token = await this.channelierService.getToken();
            return {
                success: true,
                authenticated: true,
                tokenPreview: `${token.substring(0, 20)}…`,
            };
        } catch {
            return { success: false, authenticated: false };
        }
    }
}
