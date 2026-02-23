import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { Customer, CustomerType } from './entities/customer.entity';
import { CustomerProfile } from './entities/customer-profile.entity';
import { CreateCustomerDto, CustomerScope } from './dto/create-customer.dto';
import { ShopifyService } from '../integrations/shopify/shopify.service';

export interface CustomersQuery {
    customerType?: CustomerType;
    city?: string;
    search?: string;
    hasOrders?: boolean;
    page?: number;
    limit?: number;
}

@Injectable()
export class CustomersService {
    private readonly logger = new Logger(CustomersService.name);

    constructor(
        @InjectRepository(Customer)
        private readonly customerRepository: Repository<Customer>,
        @InjectRepository(CustomerProfile)
        private readonly profileRepository: Repository<CustomerProfile>,
        @InjectQueue('customer-sync') private readonly customerSyncQueue: Queue,
        private readonly shopifyService: ShopifyService,
    ) { }

    async create(dto: CreateCustomerDto): Promise<Customer> {
        const scope = dto.scope || CustomerScope.LOCAL;

        // Normalize inputs
        if (dto.phone) {
            dto.phone = this.normalizePhone(dto.phone);
        }
        if (dto.email) {
            dto.email = this.normalizeEmail(dto.email);
        }

        // Check for existing customer with SAME phone AND email (treat as same customer)
        const existingExact = await this.customerRepository.findOne({
            where: { phone: dto.phone, email: dto.email || undefined as any },
        });
        if (existingExact) {
            throw new ConflictException('Customer with this phone and email already exists');
        }

        // Find customers with same phone (different email) for linking
        const samePhoneCustomers = dto.phone
            ? await this.customerRepository.find({ where: { phone: dto.phone } })
            : [];

        // Find customers with same email (different phone) for linking
        const sameEmailCustomers = dto.email
            ? await this.customerRepository.find({ where: { email: dto.email } })
            : [];

        let shopifyId: string | undefined = dto.shopifyId;

        // If global scope, create in Shopify first (or sync if already exists)
        if (scope === CustomerScope.GLOBAL) {
            this.logger.log(`Creating customer globally (Shopify + local) for phone: ${dto.phone}`);

            try {
                const shopifyCustomer = await this.shopifyService.createCustomer({
                    firstName: dto.firstName,
                    lastName: dto.lastName,
                    email: dto.email,
                    phone: dto.phone,
                    acceptsMarketing: dto.acceptsMarketing,
                    tags: dto.tags,
                    note: dto.note,
                    address: dto.address,
                });

                shopifyId = shopifyCustomer.id.toString();
                this.logger.log(`Created in Shopify with ID: ${shopifyId}`);
            } catch (error) {
                // Check if error is "phone already taken" (422 error)
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (errorMessage.includes('422')) {
                    this.logger.log(`Customer already exists in Shopify, searching by phone: ${dto.phone}`);

                    // Search for existing customer in Shopify
                    const existingShopifyCustomer = await this.shopifyService.searchCustomerByPhone(dto.phone);

                    if (existingShopifyCustomer) {
                        shopifyId = existingShopifyCustomer.id.toString();
                        this.logger.log(`Found existing Shopify customer: ${shopifyId}, syncing locally...`);

                        // Use Shopify data to populate local record
                        dto.firstName = dto.firstName || existingShopifyCustomer.first_name || undefined;
                        dto.lastName = dto.lastName || existingShopifyCustomer.last_name || undefined;
                        dto.email = dto.email || existingShopifyCustomer.email || undefined;
                        dto.acceptsMarketing = dto.acceptsMarketing ?? existingShopifyCustomer.accepts_marketing;
                    } else {
                        this.logger.error('Customer exists in Shopify but could not be found by phone search');
                        throw error;
                    }
                } else {
                    this.logger.error('Failed to create customer in Shopify:', error);
                    throw error;
                }
            }
        } else {
            this.logger.log(`Creating customer locally only for phone: ${dto.phone}`);
        }

        // Create local customer with linked profile IDs
        const linkedByPhone = samePhoneCustomers.map((c) => c.id);
        const linkedByEmail = sameEmailCustomers.map((c) => c.id);

        const customer = this.customerRepository.create({
            phone: dto.phone,
            email: dto.email,
            firstName: dto.firstName,
            lastName: dto.lastName,
            name: [dto.firstName, dto.lastName].filter(Boolean).join(' ') || undefined,
            acceptsMarketing: dto.acceptsMarketing ?? false,
            tags: dto.tags,
            notes: dto.note,
            shopifyId,
            addressLine1: dto.address?.address1,
            addressLine2: dto.address?.address2,
            city: dto.address?.city,
            state: dto.address?.state,
            pincode: dto.address?.pincode,
            country: dto.address?.country || 'India',
            customerType: CustomerType.NEW,
            firstSeenAt: new Date(),
            lastActivityAt: new Date(),
            lastActivityPlatform: scope === CustomerScope.GLOBAL ? 'shopify' : 'api',
            syncedAt: scope === CustomerScope.GLOBAL ? new Date() : undefined,
            linkedByPhone: linkedByPhone.length > 0 ? linkedByPhone : [],
            linkedByEmail: linkedByEmail.length > 0 ? linkedByEmail : [],
        });

        const savedCustomer = await this.customerRepository.save(customer);

        // Update linked customers to include this new customer in their linked arrays
        await this.updateLinkedProfiles(savedCustomer.id, samePhoneCustomers, sameEmailCustomers);

        return savedCustomer;
    }

    private async updateLinkedProfiles(
        newCustomerId: string,
        samePhoneCustomers: Customer[],
        sameEmailCustomers: Customer[],
    ): Promise<void> {
        // Add new customer ID to linked profiles of customers with same phone
        for (const c of samePhoneCustomers) {
            const updated = [...(c.linkedByPhone || []), newCustomerId];
            await this.customerRepository.update(c.id, { linkedByPhone: updated });
        }

        // Add new customer ID to linked profiles of customers with same email
        for (const c of sameEmailCustomers) {
            const updated = [...(c.linkedByEmail || []), newCustomerId];
            await this.customerRepository.update(c.id, { linkedByEmail: updated });
        }
    }

    async findAll(query: CustomersQuery = {}): Promise<{ customers: Customer[]; total: number }> {
        const { customerType, city, search, hasOrders, page = 1, limit = 20 } = query;

        const qb = this.customerRepository
            .createQueryBuilder('customer')
            .leftJoinAndSelect('customer.profile', 'profile');

        if (customerType) {
            qb.andWhere('customer.customerType = :customerType', { customerType });
        }

        if (city) {
            qb.andWhere('customer.city = :city', { city });
        }

        if (search) {
            let searchTerm = search;
            // Check if search looks like a phone number (mostly digits)
            if (/^[\d\s+\-()]{5,}$/.test(search)) {
                const normalizedSearch = this.normalizePhone(search);
                // Relaxed search: try normalized OR raw
                searchTerm = normalizedSearch;
            }

            qb.andWhere(
                '(customer.name ILIKE :search OR customer.phone ILIKE :search OR customer.email ILIKE :search)',
                { search: `%${search}%` },
            );
            // Also try exact match on normalized phone if different
            if (searchTerm !== search) {
                qb.orWhere('customer.phone = :normalizedPhone', { normalizedPhone: searchTerm });
            }
        }

        if (hasOrders !== undefined) {
            if (hasOrders) {
                qb.andWhere('customer.totalOrders > 0');
            } else {
                qb.andWhere('customer.totalOrders = 0');
            }
        }

        qb.orderBy('customer.lastActivityAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);

        const [customers, total] = await qb.getManyAndCount();

        return { customers, total };
    }

    async findById(id: string): Promise<Customer> {
        const customer = await this.customerRepository.findOne({
            where: { id },
            relations: ['profile'],
        });

        if (!customer) {
            throw new NotFoundException('Customer not found');
        }

        return customer;
    }

    async findByPhone(phone: string): Promise<Customer | null> {
        const normalized = this.normalizePhone(phone);
        return this.customerRepository.findOne({
            where: { phone: normalized },
            relations: ['profile'],
        });
    }

    async findByEmail(email: string): Promise<Customer | null> {
        const normalized = this.normalizeEmail(email);
        return this.customerRepository.findOne({
            where: { email: normalized },
            relations: ['profile'],
        });
    }

    async findByShopifyId(shopifyId: string): Promise<Customer | null> {
        return this.customerRepository.findOne({
            where: { shopifyId },
            relations: ['profile'],
        });
    }

    async update(id: string, updateData: Partial<Customer>): Promise<Customer> {
        const customer = await this.findById(id);

        if (updateData.phone) {
            updateData.phone = this.normalizePhone(updateData.phone);
        }
        if (updateData.email) {
            updateData.email = this.normalizeEmail(updateData.email);
        }

        Object.assign(customer, updateData);
        return this.customerRepository.save(customer);
    }

    async updateProfile(customerId: string, profileData: Partial<CustomerProfile>): Promise<CustomerProfile> {
        let profile = await this.profileRepository.findOne({
            where: { customerId },
        });

        if (!profile) {
            profile = this.profileRepository.create({ customerId });
        }

        Object.assign(profile, profileData);
        profile.lastProfileUpdate = new Date();
        return this.profileRepository.save(profile);
    }

    async triggerFullSync(days?: number): Promise<{ jobId: string }> {
        const job = await this.customerSyncQueue.add('full-sync', { days }, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 5000,
            },
        });

        return { jobId: job.id.toString() };
    }

    async getStats(): Promise<any> {
        const total = await this.customerRepository.count();
        const withOrders = await this.customerRepository.count({
            where: { totalOrders: 1 } as any, // > 0 condition approximation
        });
        const vip = await this.customerRepository.count({
            where: { customerType: CustomerType.VIP },
        });

        return {
            total,
            withOrders,
            vip,
        };
    }

    private normalizePhone(phone: string): string {
        // Strip all non-digit characters
        const digits = phone.replace(/\D/g, '');

        // Handle India cases (most common)
        if (digits.length === 10) {
            return `+91${digits}`;
        }
        if (digits.length === 11 && digits.startsWith('0')) {
            return `+91${digits.substring(1)}`;
        }
        if (digits.length === 12 && digits.startsWith('91')) {
            return `+${digits}`;
        }

        // General fallback - ensure it starts with +
        return `+${digits}`;
    }

    private normalizeEmail(email: string): string {
        return email.trim().toLowerCase();
    }
}
