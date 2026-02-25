import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Query,
    Body,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/entities/user.entity';
import { SalonsService } from '../salons/salons.service';
import { UsersService } from '../users/users.service';
import { ReferralsService } from '../referrals/referrals.service';
import { ReferralStatus } from '../referrals/entities/referral.entity';
import { SalonStage } from '../../common/enums/salon-stage.enum';

@ApiTags('Field Force')
@Controller('api/v1/field-force')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.FIELD_AGENT)
@ApiBearerAuth()
export class FieldForceController {
    constructor(
        private readonly salonsService: SalonsService,
        private readonly usersService: UsersService,
        private readonly referralsService: ReferralsService,
    ) { }

    @Get('my-salons')
    @ApiOperation({ summary: 'Get salons mapped to the logged-in field agent' })
    @ApiResponse({ status: 200, description: 'List of mapped salons' })
    async getMySalons(@CurrentUser() user: User) {
        const mappings = await this.usersService.getAgentSalons(user.id);
        return mappings.map((m) => ({
            id: m.salon?.id,
            name: m.salon?.name,
            city: (m.salon as any)?.city || '',
            address: (m.salon as any)?.address || '',
            stage: (m.salon as any)?.stage || 'APPROACH',
            ownerName: (m.salon as any)?.owner?.name || '',
            assignedAt: m.assignedAt,
        }));
    }

    @Post('salons')
    @ApiOperation({ summary: 'Create a new salon and auto-assign to this agent' })
    @ApiResponse({ status: 201, description: 'Salon created and assigned' })
    async createSalon(
        @CurrentUser() user: User,
        @Body() body: {
            name: string;
            ownerName: string;
            ownerPhone: string;
            city?: string;
            address?: string;
        },
    ) {
        if (!body.name || !body.ownerName || !body.ownerPhone) {
            throw new BadRequestException('name, ownerName, ownerPhone are required');
        }

        // Create salon in APPROACH stage
        const salon = await this.salonsService.create({
            name: body.name,
            ownerName: body.ownerName,
            ownerPhone: body.ownerPhone,
            city: body.city,
            address: body.address,
            stage: SalonStage.APPROACH,
        });

        // Auto-assign to this field agent
        await this.usersService.assignSalonsToAgent(user.id, [salon.id]);

        return salon;
    }

    @Get('salons/:id')
    @ApiOperation({ summary: 'Get salon detail' })
    @ApiResponse({ status: 200, description: 'Salon details' })
    async getSalonDetail(@Param('id') id: string) {
        return this.salonsService.findOne(id);
    }

    @Post('salons/:id/photos')
    @UseInterceptors(FileInterceptor('photo'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Upload a photo for a salon stage' })
    @ApiResponse({ status: 201, description: 'Photo uploaded' })
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
    @ApiOperation({ summary: 'Get photos for a salon' })
    @ApiResponse({ status: 200, description: 'List of photos' })
    getPhotos(
        @Param('id') id: string,
        @Query('stage') stage?: string,
    ) {
        return this.salonsService.getPhotos(id, stage as any);
    }

    @Get('lookup-owner/:phone')
    @ApiOperation({ summary: 'Look up an owner by phone number' })
    @ApiResponse({ status: 200, description: 'Owner info if found' })
    async lookupOwner(@Param('phone') phone: string) {
        const normalizedPhone = phone.startsWith('+') ? phone : `+91${phone}`;
        const user = await this.usersService.findByPhone(normalizedPhone);
        if (user) {
            return { found: true, name: user.name, phone: user.phone };
        }
        return { found: false };
    }

    @Post('salons/:id/stylists')
    @ApiOperation({ summary: 'Add a stylist to a salon' })
    @ApiResponse({ status: 201, description: 'Stylist added to salon' })
    async addStylist(
        @Param('id') id: string,
        @Body() body: { phone: string; name?: string },
    ) {
        if (!body.phone) {
            throw new BadRequestException('phone is required');
        }
        const normalizedPhone = body.phone.startsWith('+') ? body.phone : `+91${body.phone}`;
        return this.salonsService.addStylistByPhone(id, normalizedPhone, body.name);
    }

    @Patch('salons/:id')
    @ApiOperation({ summary: 'Update salon details (address, location, etc.)' })
    @ApiResponse({ status: 200, description: 'Salon updated' })
    async updateSalon(
        @Param('id') id: string,
        @Body() body: {
            name?: string;
            address?: string;
            city?: string;
            state?: string;
            pincode?: string;
            latitude?: number;
            longitude?: number;
        },
    ) {
        return this.salonsService.update(id, body as any);
    }

    @Delete('salons/:id/stylists/:stylistId')
    @ApiOperation({ summary: 'Remove a stylist from a salon' })
    @ApiResponse({ status: 200, description: 'Stylist removed from salon' })
    async removeStylist(
        @Param('id') id: string,
        @Param('stylistId') stylistId: string,
    ) {
        return this.salonsService.removeStylistFromSalon(id, stylistId);
    }

    @Get('salons/:id/referrals')
    @ApiOperation({ summary: 'Get all referrals from stylists in a salon' })
    @ApiResponse({ status: 200, description: 'List of referrals' })
    async getSalonReferrals(
        @Param('id') id: string,
        @Query('status') status?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        // Get all stylists in this salon
        const stylists = await this.salonsService.getStylistsInSalon(id);
        const stylistIds = stylists.map((s) => s.id);

        if (!stylistIds.length) {
            return { referrals: [], total: 0 };
        }

        return this.referralsService.findByStylistIds(stylistIds, {
            status: status as ReferralStatus,
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
        });
    }

    @Post('salons/:id/stylists/:stylistId/referrals')
    @ApiOperation({ summary: 'Create a referral on behalf of a stylist (field agent submits for a stylist)' })
    @ApiResponse({ status: 201, description: 'Referral created under the stylist account' })
    async createReferralOnBehalfOfStylist(
        @Param('id') salonId: string,
        @Param('stylistId') stylistId: string,
        @Body() dto: import('../referrals/dto/create-referral.dto').CreateReferralDto,
    ) {
        // Fetch the stylist so the referral is attributed to them
        const stylist = await this.usersService.findById(stylistId);
        if (!stylist) throw new BadRequestException('Stylist not found');
        return this.referralsService.create(dto, stylist);
    }
}
