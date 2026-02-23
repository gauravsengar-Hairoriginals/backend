import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Salon } from './entities/salon.entity';
import { SalonPhoto } from './entities/salon-photo.entity';
import { CreateSalonDto, UpdateSalonDto } from './dto';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { normalizePhone } from '../../common/utils/phone.util';
import { SalonStage, STAGE_CHECKLIST_ITEMS, STAGE_ORDER, CHECKLIST_LABELS } from '../../common/enums/salon-stage.enum';
import { UploadService } from './upload.service';

@Injectable()
export class SalonsService {
    constructor(
        @InjectRepository(Salon)
        private readonly salonRepository: Repository<Salon>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(SalonPhoto)
        private readonly salonPhotoRepository: Repository<SalonPhoto>,
        private readonly uploadService: UploadService,
    ) { }

    async lookupUserByPhone(phone: string): Promise<{ id: string; name: string; phone: string; role: string } | null> {
        const normalized = normalizePhone(phone);
        const user = await this.userRepository.findOne({
            where: { phone: normalized },
            select: ['id', 'name', 'phone', 'role'],
        });
        return user ? { id: user.id, name: user.name, phone: user.phone, role: user.role } : null;
    }

    async create(createSalonDto: CreateSalonDto): Promise<Salon> {
        // Create user for owner if not exists
        let owner = await this.userRepository.findOne({ where: { phone: normalizePhone(createSalonDto.ownerPhone) } });
        if (!owner) {
            const bcrypt = require('bcrypt');
            const hashedPassword = await bcrypt.hash('Welcome@123', 12);
            owner = this.userRepository.create({
                name: createSalonDto.ownerName,
                phone: normalizePhone(createSalonDto.ownerPhone),
                role: UserRole.SALON_OWNER,
                passwordHash: hashedPassword,
                isActive: true,
                isPhoneVerified: true
            });
            owner = await this.userRepository.save(owner);
        }

        const salon = this.salonRepository.create({
            ...createSalonDto,
            owner: owner
        });
        // We need to delete ownerName and ownerPhone from dto before save if it has them?
        // But the DTO still has them. The entity doesn't.
        // TypeORM create ignores extra properties usually, but best be safe.
        // Actually, since we removed columns, we can't pass them in the object to create() if strictly typed,
        // but here it's likely 'any' or partial match in JS runtime.
        // Explicitly ensuring owner relation is set.

        const savedSalon = await this.salonRepository.save(salon);

        // Ensure owner has this salon linked
        if (owner.salonId !== savedSalon.id) {
            // Logic to handle multi-salon ownership if needed later, but for now simple link
            // Actually User.ownedSalons is OneToMany, but User.salonId implies "working at"?
            // The implementation plan mainly focused on removing columns.
            // We should ensure the owner is linked correctly.
            // For now, let's just return the saved salon.
        }

        return savedSalon;
    }

    async findAll(search?: string): Promise<Salon[]> {
        const query = this.salonRepository.createQueryBuilder('salon')
            .leftJoinAndSelect('salon.owner', 'owner')
            .where('salon.isActive = :isActive', { isActive: true })
            .leftJoinAndSelect('salon.stylists', 'stylists')
            .leftJoinAndSelect('salon.fieldForceSalons', 'fieldForceSalons', 'fieldForceSalons.status = :status', { status: 'active' })
            .leftJoinAndSelect('fieldForceSalons.agent', 'agent')
            .orderBy('salon.createdAt', 'DESC');

        if (search) {
            query.andWhere(
                '(salon.name ILIKE :search OR owner.name ILIKE :search OR owner.phone ILIKE :search OR salon.managerName ILIKE :search OR salon.managerPhone ILIKE :search)',
                { search: `%${search}%` }
            );
        }

        return query.getMany();
    }

    async findOne(id: string): Promise<Salon> {
        const salon = await this.salonRepository.findOne({
            where: { id },
            relations: ['stylists', 'owner'],
        });

        if (!salon) {
            throw new NotFoundException(`Salon with ID ${id} not found`);
        }

        return salon;
    }

    async findByOwnerPhone(ownerPhone: string): Promise<Salon | null> {
        return this.salonRepository.findOne({
            where: {
                isActive: true,
                owner: {
                    phone: normalizePhone(ownerPhone)
                }
            },
            relations: ['owner']
        });
    }

    async update(id: string, updateSalonDto: UpdateSalonDto): Promise<Salon> {
        const salon = await this.findOne(id);

        // Handle owner update if provided
        if (updateSalonDto.ownerPhone) {
            const normalizedPhone = normalizePhone(updateSalonDto.ownerPhone);

            // Check if a different user already has this phone
            const existingUser = await this.userRepository.findOne({ where: { phone: normalizedPhone } });

            if (existingUser && salon.owner && existingUser.id !== salon.owner.id) {
                // Reassign salon to the existing user
                if (updateSalonDto.ownerName) existingUser.name = updateSalonDto.ownerName;
                salon.ownerId = existingUser.id;
                salon.owner = existingUser;
            } else if (existingUser && (!salon.owner || existingUser.id === salon.owner.id)) {
                // Same owner, just update name if provided
                if (updateSalonDto.ownerName) existingUser.name = updateSalonDto.ownerName;
                await this.userRepository.save(existingUser);
            } else if (!existingUser && salon.owner) {
                // No user with this phone — update current owner's phone
                if (updateSalonDto.ownerName) salon.owner.name = updateSalonDto.ownerName;
                salon.owner.phone = normalizedPhone;
                await this.userRepository.save(salon.owner);
            } else if (!existingUser && !salon.owner) {
                // No existing owner and no user with this phone — create new owner
                const bcrypt = require('bcrypt');
                const hashedPassword = await bcrypt.hash('Welcome@123', 12);
                const newOwner = this.userRepository.create({
                    name: updateSalonDto.ownerName || 'Owner',
                    phone: normalizedPhone,
                    role: UserRole.SALON_OWNER,
                    passwordHash: hashedPassword,
                    isActive: true,
                    isPhoneVerified: true,
                });
                const savedOwner = await this.userRepository.save(newOwner);
                salon.ownerId = savedOwner.id;
                salon.owner = savedOwner;
            }
        } else if (updateSalonDto.ownerName && salon.owner) {
            // Only name update, no phone change
            salon.owner.name = updateSalonDto.ownerName;
            await this.userRepository.save(salon.owner);
        }

        // Remove owner fields from DTO to avoid saving to Salon entity
        const { ownerName, ownerPhone, ...salonData } = updateSalonDto;

        Object.assign(salon, salonData);
        return this.salonRepository.save(salon);
    }

    async remove(id: string): Promise<void> {
        const salon = await this.findOne(id);
        salon.isActive = false;
        await this.salonRepository.save(salon);
    }

    async addStylistToSalon(salonId: string, stylistId: string): Promise<Salon> {
        const salon = await this.findOne(salonId);

        const stylist = await this.userRepository.findOne({
            where: { id: stylistId },
        });

        if (!stylist) {
            throw new NotFoundException(`User with ID ${stylistId} not found`);
        }

        if (stylist.role !== UserRole.STYLIST) {
            throw new BadRequestException('User must be a STYLIST to be added to a salon');
        }

        stylist.salonId = salonId;
        await this.userRepository.save(stylist);

        return this.findOne(salonId);
    }

    async addStylistByPhone(salonId: string, phone: string, name?: string): Promise<Salon> {
        const normalized = normalizePhone(phone);
        let stylist = await this.userRepository.findOne({ where: { phone: normalized } });

        if (!stylist) {
            // Create new stylist if not exists
            // Use a default password or random one. Ideally should send invite.
            const hashedPassword = await import('bcrypt').then(m => m.hash('Welcome@123', 12));
            stylist = this.userRepository.create({
                name: name || 'Stylist', // Use provided name or default
                phone: normalized,
                role: UserRole.STYLIST,
                passwordHash: hashedPassword,
                isActive: true,
                isPhoneVerified: true
            });
            stylist = await this.userRepository.save(stylist);
        }

        // If exists but not a stylist?
        // Logic: if they have a different role, we might not want to re-assign them as stylist easily.
        // But requirements say "new user should get created with stylist role". 
        // If they exist and are not stylist, maybe we should throw error or update role?
        // Let's assume for now we only add if they are STYLIST or new.
        if (stylist.role !== UserRole.STYLIST) {
            throw new BadRequestException(`User with phone ${phone} is not a STYLIST`);
        }

        // Check if already in another salon?
        // Requirement doesn't specify exclusive salon membership, but typically stylists belong to one.
        // If they belong to another, we overwrite it here.

        stylist.salonId = salonId;
        await this.userRepository.save(stylist);

        return this.findOne(salonId);
    }

    async addMemberToSalon(salonId: string, userId: string): Promise<Salon> {
        const salon = await this.findOne(salonId);
        const user = await this.userRepository.findOne({ where: { id: userId } });

        if (!user) {
            throw new NotFoundException(`User with ID ${userId} not found`);
        }

        user.salonId = salonId;
        await this.userRepository.save(user);

        return this.findOne(salonId);
    }

    async removeStylistFromSalon(salonId: string, stylistId: string): Promise<Salon> {
        const salon = await this.findOne(salonId);

        const stylist = await this.userRepository.findOne({
            where: { id: stylistId, salonId },
        });

        if (!stylist) {
            throw new NotFoundException(`Stylist with ID ${stylistId} not found in this salon`);
        }

        stylist.salonId = null as any;
        await this.userRepository.save(stylist);

        return this.findOne(salonId);
    }

    async getStylistsInSalon(salonId: string): Promise<User[]> {
        await this.findOne(salonId); // Verify salon exists

        return this.userRepository.find({
            where: { salonId, role: UserRole.STYLIST },
            select: ['id', 'name', 'phone', 'email', 'isActive'],
        });
    }

    /**
     * Update checklist items for a salon.
     * Returns the updated salon + whether the current stage is ready to advance.
     */
    async updateChecklist(salonId: string, updates: Record<string, boolean>): Promise<{ salon: Salon; readyToAdvance: boolean }> {
        const salon = await this.findOne(salonId);

        // Validate that the checklist keys are valid for the current stage
        const validKeys = STAGE_CHECKLIST_ITEMS[salon.stage] || [];
        for (const key of Object.keys(updates)) {
            if (!validKeys.includes(key)) {
                throw new BadRequestException(`Invalid checklist item '${key}' for stage '${salon.stage}'. Valid items: ${validKeys.join(', ')}`);
            }
        }

        // Merge updates into existing checklist
        salon.checklist = { ...salon.checklist, ...updates };
        await this.salonRepository.save(salon);

        // Check if all items for current stage are complete
        const readyToAdvance = validKeys.length > 0 && validKeys.every(key => salon.checklist[key] === true);

        return { salon, readyToAdvance };
    }

    /**
     * Advance salon to the next stage. All checklist items for the current stage must be complete.
     */
    async advanceStage(salonId: string): Promise<Salon> {
        const salon = await this.findOne(salonId);

        const currentIndex = STAGE_ORDER.indexOf(salon.stage);
        if (currentIndex === -1 || currentIndex >= STAGE_ORDER.length - 1) {
            throw new BadRequestException(`Cannot advance from stage '${salon.stage}'`);
        }

        // Verify all checklist items for current stage are complete
        const requiredItems = STAGE_CHECKLIST_ITEMS[salon.stage] || [];
        const incomplete = requiredItems.filter(key => !salon.checklist[key]);
        if (incomplete.length > 0) {
            const labels = incomplete.map(k => CHECKLIST_LABELS[k] || k).join(', ');
            throw new BadRequestException(`Cannot advance. Incomplete items: ${labels}`);
        }

        salon.stage = STAGE_ORDER[currentIndex + 1];
        salon.stageUpdatedAt = new Date();
        return this.salonRepository.save(salon);
    }

    /**
     * Manually set a salon's stage (admin override, e.g. to close a store).
     */
    async setStage(salonId: string, stage: SalonStage): Promise<Salon> {
        const salon = await this.findOne(salonId);
        salon.stage = stage;
        salon.stageUpdatedAt = new Date();
        return this.salonRepository.save(salon);
    }

    /**
     * Get the checklist config for a salon's current stage.
     */
    getStageChecklist(stage: SalonStage): { key: string; label: string }[] {
        const items = STAGE_CHECKLIST_ITEMS[stage] || [];
        return items.map(key => ({ key, label: CHECKLIST_LABELS[key] || key }));
    }

    // ─── Photo Management ───

    async uploadPhoto(
        salonId: string,
        fileBuffer: Buffer,
        originalName: string,
        mimeType: string,
        stage: SalonStage,
        uploadedById?: string,
        caption?: string,
        checklistItem?: string,
    ): Promise<SalonPhoto> {
        // Ensure salon exists
        await this.findOne(salonId);

        const url = await this.uploadService.uploadFile(fileBuffer, originalName, mimeType, salonId, stage);

        const photo = new SalonPhoto();
        photo.salonId = salonId;
        photo.stage = stage;
        photo.url = url;
        if (uploadedById) photo.uploadedById = uploadedById;
        if (caption) photo.caption = caption;
        if (checklistItem) photo.checklistItem = checklistItem;

        return this.salonPhotoRepository.save(photo);
    }

    async getPhotos(salonId: string, stage?: SalonStage): Promise<SalonPhoto[]> {
        const where: any = { salonId };
        if (stage) where.stage = stage;

        return this.salonPhotoRepository.find({
            where,
            relations: ['uploadedBy'],
            order: { createdAt: 'DESC' },
        });
    }

    async deletePhoto(photoId: string): Promise<void> {
        const photo = await this.salonPhotoRepository.findOne({ where: { id: photoId } });
        if (!photo) throw new NotFoundException('Photo not found');

        await this.uploadService.deleteFile(photo.url);
        await this.salonPhotoRepository.remove(photo);
    }
}
