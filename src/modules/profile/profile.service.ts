import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from './entities/profile.entity';
import { UpdateProfileDto, StylistProfileDto, FieldAgentProfileDto } from './dto';
import { UsersService } from '../users/users.service';
import { SalonsService } from '../salons/salons.service';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../users/enums/user-role.enum';

@Injectable()
export class ProfileService {
    constructor(
        @InjectRepository(Profile)
        private readonly profileRepository: Repository<Profile>,
        private readonly usersService: UsersService,
        private readonly salonsService: SalonsService,
    ) { }

    async getProfile(userId: string): Promise<{ user: any; stylistProfile: any }> {
        const user = await this.usersService.findById(userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const profile = await this.profileRepository.findOne({
            where: { userId },
        });

        const { passwordHash, ...userWithoutPassword } = user;

        // Overlay Live Salon Details if linked
        let enrichedProfile = profile ? { ...profile } : {};

        if (user.salonId) {
            const salon = await this.salonsService.findOne(user.salonId);
            if (salon) {
                // Ensure owner and manager details are also fetched if needed specific to salon
                // For now, mapping standard fields
                enrichedProfile = {
                    ...enrichedProfile,
                    salonName: salon.name,
                    salonAddress: salon.address,
                    salonCity: salon.city,
                    salonState: salon.state,
                    salonPincode: salon.pincode,
                    latitude: salon.latitude,
                    longitude: salon.longitude,
                    ownerName: salon.owner?.name,
                    ownerPhone: salon.owner?.phone,
                    managerName: salon.managerName,
                    managerPhone: salon.managerPhone,
                };
            }
        }

        return {
            user: userWithoutPassword,
            stylistProfile: enrichedProfile as Profile,
        };
    }

    async updateProfile(userId: string, updateProfileDto: UpdateProfileDto): Promise<{ user: any; stylistProfile: Profile }> {
        const user = await this.usersService.findById(userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Update user name if provided
        if (updateProfileDto.name) {
            await this.usersService.update(userId, { name: updateProfileDto.name });
        }

        // Get or create profile
        let profile = await this.profileRepository.findOne({
            where: { userId },
        });

        if (!profile) {
            profile = this.profileRepository.create({ userId });
        }

        // Update profile fields
        const { name, ...profileFields } = updateProfileDto;
        Object.assign(profile, profileFields);

        const savedProfile = await this.profileRepository.save(profile);
        const updatedUser = await this.usersService.findById(userId);
        const { passwordHash, ...userWithoutPassword } = updatedUser!;

        return {
            user: userWithoutPassword,
            stylistProfile: savedProfile,
        };
    }

    async updateStylistProfile(userId: string, stylistProfileDto: StylistProfileDto): Promise<Profile> {
        let profile = await this.profileRepository.findOne({
            where: { userId },
        });

        if (!profile) {
            profile = this.profileRepository.create({ userId });
        }

        // Handle Salon Creation/Linking Logic
        if (stylistProfileDto.ownerPhone && stylistProfileDto.salonName) {
            let salon = await this.salonsService.findByOwnerPhone(stylistProfileDto.ownerPhone);

            if (!salon) {
                // Create new salon if not exists
                salon = await this.salonsService.create({
                    name: stylistProfileDto.salonName,
                    ownerName: stylistProfileDto.ownerName || 'Unknown',
                    ownerPhone: stylistProfileDto.ownerPhone,
                    address: stylistProfileDto.salonAddress,
                    city: stylistProfileDto.salonCity,
                    state: stylistProfileDto.salonState,
                    pincode: stylistProfileDto.salonPincode,
                    latitude: stylistProfileDto.latitude,
                    longitude: stylistProfileDto.longitude,
                });
            }

            // Link user to salon
            await this.salonsService.addStylistToSalon(salon.id, userId);

            // Handle Salon Owner Creation
            if (stylistProfileDto.ownerPhone) {
                let owner = await this.usersService.findByPhone(stylistProfileDto.ownerPhone);
                if (!owner) {
                    const hashedPassword = await bcrypt.hash('Welcome@123', 12);
                    owner = await this.usersService.create({
                        name: stylistProfileDto.ownerName || 'Salon Owner',
                        phone: stylistProfileDto.ownerPhone,
                        role: UserRole.SALON_OWNER,
                        passwordHash: hashedPassword,
                    });
                }
                // Ensure owner is linked to this salon
                if (owner.salonId !== salon.id) {
                    await this.salonsService.addMemberToSalon(salon.id, owner.id);
                }
            }

            // Handle Salon Manager Creation
            if (stylistProfileDto.managerPhone) {
                let manager = await this.usersService.findByPhone(stylistProfileDto.managerPhone);
                if (!manager) {
                    const hashedPassword = await bcrypt.hash('Welcome@123', 12);
                    manager = await this.usersService.create({
                        name: stylistProfileDto.managerName || 'Salon Manager',
                        phone: stylistProfileDto.managerPhone,
                        role: UserRole.SALON_MANAGER,
                        passwordHash: hashedPassword,
                    });
                }
                // Ensure manager is linked to this salon
                if (manager.salonId !== salon.id) {
                    await this.salonsService.addMemberToSalon(salon.id, manager.id);
                }
            }
        }

        // Separate core profile fields from salon fields to avoid "unknown column" errors
        const {
            salonName, salonAddress, salonCity, salonState, salonPincode,
            latitude, longitude, ownerName, ownerPhone, managerName, managerPhone,
            ...profileData
        } = stylistProfileDto;

        Object.assign(profile, profileData);
        return this.profileRepository.save(profile);
    }

    async verifyUpi(userId: string, upiPhone: string): Promise<{ success: boolean; attemptsRemaining: number; message: string }> {
        let profile = await this.profileRepository.findOne({
            where: { userId },
        });

        if (!profile) {
            profile = this.profileRepository.create({ userId });
        }

        if (profile.upiVerificationAttempts >= 3) {
            throw new BadRequestException('Maximum verification attempts reached. Please contact support.');
        }

        // Mock verification logic: In production this would interact with a payment gateway to send ₹1
        // We simulate a successful transaction here.
        const isSuccess = true;

        profile.upiVerificationAttempts += 1;

        if (isSuccess) {
            profile.upiPhone = upiPhone;
        }

        await this.profileRepository.save(profile);

        return {
            success: isSuccess,
            attemptsRemaining: 3 - profile.upiVerificationAttempts,
            message: isSuccess ? ' Verification successful! ₹1 sent to your UPI.' : 'Verification failed.',
        };
    }

    async updateFieldAgentProfile(userId: string, fieldAgentProfileDto: FieldAgentProfileDto): Promise<Profile> {
        let profile = await this.profileRepository.findOne({
            where: { userId },
        });

        if (!profile) {
            profile = this.profileRepository.create({ userId });
        }

        Object.assign(profile, fieldAgentProfileDto);
        return this.profileRepository.save(profile);
    }
}
