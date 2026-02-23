
import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PartnerService } from './partner.service';
import { SalonsService } from '../salons/salons.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('api/v1/partner')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SALON_OWNER)
export class PartnerController {
    constructor(
        private readonly partnerService: PartnerService,
        private readonly salonsService: SalonsService,
    ) { }

    @Get('dashboard')
    async getDashboard(@CurrentUser() user: User) {
        return this.partnerService.getDashboardStats(user);
    }

    @Get('salons/:id')
    async getSalonDetails(@Param('id') id: string, @CurrentUser() user: User) {
        return this.partnerService.getSalonDetails(id, user);
    }

    @Post('salons/:id/stylists')
    async addStylist(
        @Param('id') id: string,
        @Body() body: { name: string; phone: string },
        @CurrentUser() user: User
    ) {
        return this.partnerService.addStylist(id, body, user);
    }
    @Delete('salons/:id/stylists/:stylistId')
    async removeStylist(
        @Param('id') id: string,
        @Param('stylistId') stylistId: string,
        @CurrentUser() user: User
    ) {
        return this.partnerService.removeStylist(id, stylistId, user);
    }
    @Get('profile')
    async getProfile(@CurrentUser() user: User) {
        return user;
    }

    @Patch('profile')
    async updateProfile(
        @Body() body: UpdateProfileDto,

        @CurrentUser() user: User
    ) {
        return this.partnerService.updateProfile(user, body);
    }

    @Patch('salons/:id')
    async updateSalon(
        @Param('id') id: string,
        @Body() body: any, // Use DTO properly
        @CurrentUser() user: User
    ) {
        return this.partnerService.updateSalon(id, body, user);
    }

    // ─── Photo Upload ───

    @Post('salons/:id/photos')
    @UseInterceptors(FileInterceptor('photo'))
    async uploadPhoto(
        @Param('id') id: string,
        @UploadedFile() file: any,
        @Body() body: { stage: string; caption?: string; checklistItem?: string },
        @CurrentUser() user: User,
    ) {
        if (!file) {
            throw new BadRequestException('No photo file provided');
        }
        if (!body.stage) {
            throw new BadRequestException('stage is required');
        }
        // Verify ownership
        const salon = await this.salonsService.findOne(id);
        if (salon.ownerId !== user.id && salon.owner?.id !== user.id) {
            throw new BadRequestException('You do not own this salon');
        }
        return this.salonsService.uploadPhoto(
            id,
            file.buffer,
            file.originalname,
            file.mimetype,
            body.stage as any,
            user.id,
            body.caption,
            body.checklistItem,
        );
    }

    @Get('salons/:id/photos')
    async getPhotos(
        @Param('id') id: string,
        @Query('stage') stage?: string,
        @CurrentUser() user?: User,
    ) {
        return this.salonsService.getPhotos(id, stage as any);
    }
}
