import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

// ── Types ────────────────────────────────────────────────────────────────────

interface ChannelierLoginResponse {
    success: boolean;
    error?: string;
    tokens?: {
        token: string;
        refresh_token: string;
    };
    user?: {
        customer_id: string;
        customer_name: string;
        email: string;
        organization_id: string;
        organization_name: string;
    };
}

interface TokenCache {
    token: string;
    refreshToken: string;
    expiresAt: number; // Unix ms
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ChannelierService {
    private readonly logger = new Logger(ChannelierService.name);

    private readonly baseUrl: string;
    private readonly apiKey: string;
    private readonly userId: string;
    private readonly password: string;

    private readonly http: AxiosInstance;

    /** In-memory token cache — shared for the lifetime of the process */
    private tokenCache: TokenCache | null = null;

    constructor(private readonly configService: ConfigService) {
        this.baseUrl = (this.configService.get<string>('CHANNELIER_BASE_URL') ?? '').trim();
        this.apiKey  = (this.configService.get<string>('CHANNELIER_API_KEY')  ?? '').trim();
        this.userId  = (this.configService.get<string>('CHANNELIER_USERID')   ?? '').trim();
        this.password = (this.configService.get<string>('CHANNELIER_PASSWORD') ?? '').trim();

        this.http = axios.create({ baseURL: this.baseUrl });
    }

    // ── 1. Auth / Token management ─────────────────────────────────────────

    /**
     * Returns a valid Channelier Bearer token.
     * Uses the in-memory cache; fetches a fresh token when it has less than 5 minutes remaining.
     */
    async getToken(): Promise<string> {
        const fiveMinutes = 5 * 60 * 1000;

        if (this.tokenCache && this.tokenCache.expiresAt - Date.now() > fiveMinutes) {
            this.logger.verbose('[Channelier] Using cached token');
            return this.tokenCache.token;
        }

        this.logger.log('[Channelier] Fetching fresh auth token…');
        return this.fetchNewToken();
    }

    /**
     * Returns the Authorization header object for downstream Channelier API calls.
     * Usage: `await this.channelierService.getAuthHeaders()`
     */
    async getAuthHeaders(): Promise<Record<string, string>> {
        const token = await this.getToken();
        return { Authorization: `Bearer ${token}` };
    }

    /**
     * Calls POST /validateLogin and caches the resulting token.
     */
    private async fetchNewToken(): Promise<string> {
        const url = `/validateLogin?key=${encodeURIComponent(this.apiKey)}`;

        try {
            const { data } = await this.http.post<ChannelierLoginResponse>(url, {
                email:    this.userId,
                password: this.password,
            });

            if (!data.success || !data.tokens?.token) {
                const reason = data.error ?? 'Unknown error from Channelier auth';
                this.logger.error(`[Channelier] Login failed: ${reason}`);
                throw new UnauthorizedException(`Channelier login failed: ${reason}`);
            }

            // The API does not expose an expiry field — default TTL of 23 hours.
            const ttlMs = 23 * 60 * 60 * 1000;
            this.tokenCache = {
                token:        data.tokens.token,
                refreshToken: data.tokens.refresh_token ?? '',
                expiresAt:    Date.now() + ttlMs,
            };

            this.logger.log(
                `[Channelier] Token obtained for user="${data.user?.customer_name ?? this.userId}" ` +
                `org="${data.user?.organization_name ?? '—'}"`,
            );

            return this.tokenCache.token;
        } catch (err: any) {
            if (err instanceof UnauthorizedException) throw err;
            this.logger.error(`[Channelier] HTTP error during login: ${err?.message}`);
            throw err;
        }
    }

    // ── 2. Generic authenticated request helper ────────────────────────────

    /**
     * Makes an authenticated GET request to Channelier.
     * All downstream methods should use this to avoid duplicating auth logic.
     */
    async get<T = any>(path: string, params?: Record<string, any>): Promise<T> {
        const headers = await this.getAuthHeaders();
        const { data } = await this.http.get<T>(path, {
            headers,
            params: { key: this.apiKey, ...params },
        });
        return data;
    }

    /**
     * Makes an authenticated POST request to Channelier.
     */
    async post<T = any>(path: string, body?: any, params?: Record<string, any>): Promise<T> {
        const headers = await this.getAuthHeaders();
        const { data } = await this.http.post<T>(path, body, {
            headers,
            params: { key: this.apiKey, ...params },
        });
        return data;
    }

    // ── 3. Record Sync Methods ───────────────────────────────────────────────

    /**
     * Creates a Lead in Channelier.
     * Maps essential HO lead fields to Channelier schema and returns the new lead_id.
     */
    async createLead(leadData: {
        customerName: string;
        customerPhone: string;
        contactPersonFirstName: string;
        state: number;
        cityId: number;
        city: string;
        address?: string;
    }): Promise<string> {
        this.logger.log(`[Channelier] Creating lead for phone: ${leadData.customerPhone}`);
        
        try {
            const payload = {
                company_name: leadData.customerName || 'Unknown Customer',
                contact_person_firstname: leadData.contactPersonFirstName || leadData.customerName || 'Unknown',
                contact_person_mobile: leadData.customerPhone,
                company_state: leadData.state || 1, // Fallback integer required
                company_city_id: leadData.cityId || 1, // Fallback integer required
                company_city: leadData.city || 'Delhi', 
                company_address_line1: leadData.address || '',
                lead_type: 1, // Assuming 1 = normal lead
                lead_stage_id: 1, // Assuming 1 = New/Open
                lead_status: 1, // Assuming 1 = Active
            };

            const response = await this.post<{ success: boolean; lead_id?: string; error?: string }>('/lead', payload);
            
            if (!response.success || !response.lead_id) {
                this.logger.error(`[Channelier] Lead creation failed: ${response.error || 'No lead_id returned'}`);
                throw new Error(`Channelier Lead creation failed: ${response.error || 'Unknown error'}`);
            }

            this.logger.log(`[Channelier] Successfully created lead: ID ${response.lead_id}`);
            return response.lead_id;
        } catch (error: any) {
            this.logger.error(`[Channelier] Error creating lead: ${error.message}`);
            throw error;
        }
    }

    /**
     * Creates a Task in Channelier linked to a specific lead and assigned to an employee.
     */
    async createTask(taskData: {
        channelierEmployeeId: string;
        taskName: string;
        scheduledTime: Date;
        leadId: string;
    }): Promise<boolean> {
        this.logger.log(`[Channelier] Creating task "${taskData.taskName}" assigned to ${taskData.channelierEmployeeId}`);
        
        try {
            // ISO 8601 formatting or standard DB format
            const startTimeIso = taskData.scheduledTime.toISOString().replace('T', ' ').substring(0, 19);

            const payload = {
                assigned_to: taskData.channelierEmployeeId,
                name: taskData.taskName,
                status_id: 1, // Assuming 1 = Pending/Todo
                start_date_time: startTimeIso,
                lead_id: parseInt(taskData.leadId, 10),
            };

            const response = await this.post<{ success: boolean; error?: string }>('/task', payload);
            
            if (!response.success) {
                this.logger.error(`[Channelier] Task creation failed: ${response.error || 'Unknown error'}`);
                throw new Error(`Channelier Task creation failed: ${response.error || 'Unknown error'}`);
            }

            this.logger.log(`[Channelier] Successfully created task for Lead ${taskData.leadId}`);
            return true;
        } catch (error: any) {
            this.logger.error(`[Channelier] Error creating task: ${error.message}`);
            throw error;
        }
    }
}
