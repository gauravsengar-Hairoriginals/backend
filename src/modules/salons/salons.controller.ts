import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    UseGuards,
    BadRequestException,
    Query,
    UseInterceptors,
    UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { SalonsService } from './salons.service';
import { CreateSalonDto, UpdateSalonDto, AddStylistToSalonDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { SalonStage } from '../../common/enums/salon-stage.enum';

@ApiTags('Salons')
@Controller('api/v1/salons')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SalonsController {
    constructor(private readonly salonsService: SalonsService) { }

    @Post()
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_AGENT)
    @ApiOperation({ summary: 'Create a new salon' })
    @ApiResponse({ status: 201, description: 'Salon created successfully' })
    create(@Body() createSalonDto: CreateSalonDto) {
        return this.salonsService.create(createSalonDto);
    }

    @Get()
    @ApiOperation({ summary: 'Get all salons' })
    @ApiResponse({ status: 200, description: 'List of salons' })
    findAll(@Query('search') search?: string) {
        return this.salonsService.findAll(search);
    }

    @Get('lookup-user')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_AGENT)
    @ApiOperation({ summary: 'Lookup a user by phone number' })
    @ApiResponse({ status: 200, description: 'User found' })
    @ApiResponse({ status: 404, description: 'No user with this phone' })
    async lookupUserByPhone(@Query('phone') phone: string) {
        if (!phone || phone.length < 10) {
            throw new BadRequestException('Please provide a valid 10-digit phone number');
        }
        const user = await this.salonsService.lookupUserByPhone(phone);
        if (!user) {
            return { found: false, user: null };
        }
        return { found: true, user };
    }

    @Get('stage-config')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_AGENT)
    @ApiOperation({ summary: 'Get checklist config for a stage' })
    getStageConfig(@Query('stage') stage: SalonStage) {
        if (!stage || !Object.values(SalonStage).includes(stage)) {
            throw new BadRequestException(`Invalid stage. Must be one of: ${Object.values(SalonStage).join(', ')}`);
        }
        return this.salonsService.getStageChecklist(stage);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a salon by ID' })
    @ApiResponse({ status: 200, description: 'Salon details' })
    @ApiResponse({ status: 404, description: 'Salon not found' })
    findOne(@Param('id') id: string) {
        return this.salonsService.findOne(id);
    }

    @Patch(':id')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_AGENT)
    @ApiOperation({ summary: 'Update a salon' })
    @ApiResponse({ status: 200, description: 'Salon updated successfully' })
    @ApiResponse({ status: 404, description: 'Salon not found' })
    update(@Param('id') id: string, @Body() updateSalonDto: UpdateSalonDto) {
        return this.salonsService.update(id, updateSalonDto);
    }

    @Patch(':id/checklist')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_AGENT)
    @ApiOperation({ summary: 'Update salon checklist items' })
    @ApiResponse({ status: 200, description: 'Checklist updated' })
    async updateChecklist(
        @Param('id') id: string,
        @Body() body: { checklist: Record<string, boolean> },
    ) {
        if (!body.checklist || typeof body.checklist !== 'object') {
            throw new BadRequestException('checklist must be an object with boolean values');
        }
        return this.salonsService.updateChecklist(id, body.checklist);
    }

    @Post(':id/advance-stage')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    @ApiOperation({ summary: 'Verify & advance salon to next stage' })
    @ApiResponse({ status: 200, description: 'Stage advanced' })
    @ApiResponse({ status: 400, description: 'Checklist incomplete or cannot advance' })
    advanceStage(@Param('id') id: string) {
        return this.salonsService.advanceStage(id);
    }

    @Patch(':id/stage')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    @ApiOperation({ summary: 'Manually set salon stage (admin override)' })
    @ApiResponse({ status: 200, description: 'Stage updated' })
    setStage(@Param('id') id: string, @Body() body: { stage: SalonStage }) {
        if (!body.stage || !Object.values(SalonStage).includes(body.stage)) {
            throw new BadRequestException(`Invalid stage. Must be one of: ${Object.values(SalonStage).join(', ')}`);
        }
        return this.salonsService.setStage(id, body.stage);
    }

    @Delete(':id')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    @ApiOperation({ summary: 'Delete a salon (soft delete)' })
    @ApiResponse({ status: 200, description: 'Salon deleted successfully' })
    @ApiResponse({ status: 404, description: 'Salon not found' })
    remove(@Param('id') id: string) {
        return this.salonsService.remove(id);
    }

    @Post(':id/stylists')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_AGENT, UserRole.SALON_OWNER)
    @ApiOperation({ summary: 'Add a stylist to a salon' })
    @ApiResponse({ status: 200, description: 'Stylist added to salon' })
    @ApiResponse({ status: 404, description: 'Salon or stylist not found' })
    @ApiResponse({ status: 403, description: 'Forbidden if owner tries to add to another salon' })
    async addStylist(
        @Param('id') id: string,
        @Body() addStylistDto: AddStylistToSalonDto,
        @CurrentUser() user: User,
    ) {
        if (user.role === UserRole.SALON_OWNER) {
            const salon = await this.salonsService.findOne(id);
            if (salon.owner?.id !== user.id) {
                if (salon.ownerId !== user.id) {
                    throw new BadRequestException('You do not own this salon');
                }
            }
        }

        if (addStylistDto.phone) {
            return this.salonsService.addStylistByPhone(id, addStylistDto.phone, addStylistDto.name);
        }
        if (addStylistDto.stylistId) {
            return this.salonsService.addStylistToSalon(id, addStylistDto.stylistId);
        }
        throw new BadRequestException('Either stylistId or phone must be provided');
    }

    @Delete(':id/stylists/:stylistId')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_AGENT, UserRole.SALON_OWNER)
    @ApiOperation({ summary: 'Remove a stylist from a salon' })
    @ApiResponse({ status: 200, description: 'Stylist removed from salon' })
    @ApiResponse({ status: 404, description: 'Salon or stylist not found' })
    async removeStylist(
        @Param('id') id: string,
        @Param('stylistId') stylistId: string,
        @CurrentUser() user: User,
    ) {
        if (user.role === UserRole.SALON_OWNER) {
            const salon = await this.salonsService.findOne(id);
            if (salon.owner?.id !== user.id && salon.ownerId !== user.id) {
                throw new BadRequestException('You do not own this salon');
            }
        }
        return this.salonsService.removeStylistFromSalon(id, stylistId);
    }

    @Get(':id/stylists')
    @ApiOperation({ summary: 'Get all stylists in a salon' })
    @ApiResponse({ status: 200, description: 'List of stylists in salon' })
    @ApiResponse({ status: 404, description: 'Salon not found' })
    getStylists(@Param('id') id: string) {
        return this.salonsService.getStylistsInSalon(id);
    }

    // ─── Photo Endpoints ───

    @Post(':id/photos')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_AGENT, UserRole.SALON_OWNER)
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
        const stage = body.stage as any;
        if (!stage) {
            throw new BadRequestException('stage is required');
        }
        return this.salonsService.uploadPhoto(
            id,
            file.buffer,
            file.originalname,
            file.mimetype,
            stage,
            user.id,
            body.caption,
            body.checklistItem,
        );
    }

    @Get(':id/photos')
    @ApiOperation({ summary: 'Get photos for a salon (optionally by stage)' })
    @ApiResponse({ status: 200, description: 'List of photos' })
    getPhotos(
        @Param('id') id: string,
        @Query('stage') stage?: string,
    ) {
        return this.salonsService.getPhotos(id, stage as any);
    }

    @Delete(':id/photos/:photoId')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    @ApiOperation({ summary: 'Delete a salon photo' })
    @ApiResponse({ status: 200, description: 'Photo deleted' })
    deletePhoto(@Param('photoId') photoId: string) {
        return this.salonsService.deletePhoto(photoId);
    }
}
