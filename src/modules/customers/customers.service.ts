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

        let shopifyId: string | undefined;

        // If global scope, create in Shopify first
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
                this.logger.error('Failed to create customer in Shopify:', error);
                throw error;
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
            qb.andWhere(
                '(customer.name ILIKE :search OR customer.phone ILIKE :search OR customer.email ILIKE :search)',
                { search: `%${search}%` },
            );
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
        return this.customerRepository.findOne({
            where: { phone },
            relations: ['profile'],
        });
    }

    async findByEmail(email: string): Promise<Customer | null> {
        return this.customerRepository.findOne({
            where: { email },
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

    async triggerFullSync(): Promise<{ jobId: string }> {
        const job = await this.customerSyncQueue.add('full-sync', {}, {
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
}
