import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SalonsService } from './modules/salons/salons.service';
import { UsersService } from './modules/users/users.service';
import { UserRole } from './modules/users/enums/user-role.enum';
import * as bcrypt from 'bcrypt';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const salonsService = app.get(SalonsService);
    const usersService = app.get(UsersService);

    console.log('--- Starting Edit Salon Verification ---');

    // 1. Create a Test Stylist
    const stylistPhone = '9000000009';
    let stylist = await usersService.findByPhone(stylistPhone);
    if (!stylist) {
        stylist = await usersService.create({
            name: 'Edit Test Stylist',
            phone: stylistPhone,
            role: UserRole.STYLIST,
            passwordHash: await bcrypt.hash('password', 10),
        });
    }

    // 2. Create a Test Salon
    const ownerPhone = '8000000008';
    let salon = await salonsService.findByOwnerPhone(ownerPhone);
    if (!salon) {
        salon = await salonsService.create({
            name: 'Edit Test Salon',
            ownerName: 'Original Owner',
            ownerPhone: ownerPhone,
            city: 'Original City',
        });
    }

    // 3. Add Stylist to Salon
    console.log('Adding stylist to salon...');
    await salonsService.addStylistToSalon(salon.id, stylist.id);

    // 4. Update Salon Details (Simulate Edit Form)
    console.log('Updating salon details (Manager, Address)...');
    const updateDto = {
        name: 'Updated Test Salon',
        managerName: 'New Manager',
        managerPhone: '7000000007',
        address: '123 New St',
        city: 'New City',
        state: 'New State',
        pincode: '543210',
    };
    await salonsService.update(salon.id, updateDto);

    // Verify Update
    const updatedSalon = await salonsService.findOne(salon.id);
    if (updatedSalon.managerName === 'New Manager' && updatedSalon.city === 'New City') {
        console.log('SUCCESS: Salon details updated correctly.');
    } else {
        console.error('FAILED: Salon details update failed.', updatedSalon);
    }

    // 5. Remove Stylist (Simulate Remove Button)
    console.log('Removing stylist from salon...');
    await salonsService.removeStylistFromSalon(salon.id, stylist.id);

    // Verify Removal
    const stylistAfterRemoval = await usersService.findById(stylist.id);
    if (!stylistAfterRemoval) {
        console.error('FAILED: Stylist not found after update.');
    } else if (!stylistAfterRemoval.salonId) {
        console.log('SUCCESS: Stylist removed from salon.');
    } else {
        console.error('FAILED: Stylist still linked to salon.', stylistAfterRemoval);
    }

    // 6. Test Add Stylist By Phone (New Feature)
    console.log('Testing Add Stylist By Phone...');
    const newStylistPhone = '6000000006';
    // Ensure user doesn't exist suitable for test
    const existingNewStylist = await usersService.findByPhone(newStylistPhone);
    if (existingNewStylist) await (usersService as any).userRepository.remove(existingNewStylist);

    const stylistName = 'New Phone Stylist';
    await salonsService.addStylistByPhone(salon.id, newStylistPhone, stylistName);

    const addedStylist = await usersService.findByPhone(newStylistPhone);
    if (addedStylist && addedStylist.salonId === salon.id && addedStylist.role === UserRole.STYLIST && addedStylist.name === stylistName) {
        console.log('SUCCESS: New stylist created and added by phone with correct NAME.');
    } else {
        console.error('FAILED: Add stylist by phone failed.', addedStylist);
    }

    await app.close();
}

bootstrap();
