import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as csvParse from 'csv-parse/sync';
import { FbConfig } from './entities/fb-config.entity';
import { FbLeadForm } from './entities/fb-lead-form.entity';
import { LeadsService } from '../leads/leads.service';

@Injectable()
export class FacebookService {
    private readonly logger = new Logger(FacebookService.name);

    constructor(
        @InjectRepository(FbConfig)
        private readonly fbConfigRepo: Repository<FbConfig>,
        @InjectRepository(FbLeadForm)
        private readonly fbLeadFormRepo: Repository<FbLeadForm>,
        private readonly leadsService: LeadsService,
        private readonly configService: ConfigService,
    ) { }

    // ── Offline CSV Handlers ──────────────────────────────────────────────

    async processNewFormCsv(file: Express.Multer.File) {
        if (!file) throw new BadRequestException('No CSV file provided');
        const csvText = this.decodeFileBuffer(file.buffer);

        // Facebook sometimes exports with Tabs instead of Commas despite the .csv extension
        const firstLine = csvText.split('\n')[0];
        const isTabSeparated = firstLine.includes('\t');

        const rawRecords = csvParse.parse(csvText, {
            columns: true,
            skip_empty_lines: true,
            delimiter: isTabSeparated ? '\t' : ','
        });

        // Strip Zero-width No-Break Space (BOM) from keys if present (e.g., '﻿id' -> 'id')
        const records = rawRecords.map((row: any) => {
            const cleanRow: any = {};
            for (const key in row) {
                const cleanKey = key.replace(/^\uFEFF/, '');
                cleanRow[cleanKey] = row[key];
            }
            return cleanRow;
        });

        if (records.length === 0) {
            throw new BadRequestException('CSV file is empty');
        }

        // 1. Extract Form ID and Name from the first row
        const firstRow = records[0] as Record<string, string>;
        const fbFormId = firstRow['form_id'];
        const formName = firstRow['form_name'];

        if (!fbFormId || !formName) {
            throw new BadRequestException('CSV does not contain required "form_id" and "form_name" columns. Is this a valid Facebook Leads export?');
        }

        // 2. Check if form already exists
        let form = await this.fbLeadFormRepo.findOne({ where: { fbFormId } });

        if (!form) {
            // 3. Extract Headers / Questions
            const standardFields = ['id', 'created_time', 'ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name', 'form_id', 'form_name', 'is_organic', 'platform'];
            const allHeaders = Object.keys(firstRow);
            const questionHeaders = allHeaders.filter(h => !standardFields.includes(h));

            const questions = questionHeaders.map(header => ({
                key: header,
                label: this.formatHeaderLabel(header),
                type: this.guessFieldType(header),
            }));

            const autoMapping = this.suggestMapping(questions);

            // 4. Create the new form
            form = this.fbLeadFormRepo.create({
                fbFormId,
                formName,
                fbPageId: 'offline_csv', // Placeholder since it's not tied to a living config
                status: 'active',
                questions,
                fieldMapping: autoMapping,
                syncEnabled: false, // Sync only applies to webhooks
            });
            form = await this.fbLeadFormRepo.save(form);
            this.logger.log(`[FB] Created new form from CSV: ${formName} (${fbFormId})`);
        }

        // 5. Return the newly created form — do NOT ingest data here.
        // The admin must first set the category via "Map Fields",
        // then upload leads using "Upload CSV" on the existing form.
        return {
            success: true,
            formId: form.id,
            formName: form.formName,
            message: `Form "${form.formName}" created. Please set the Category in Map Fields, then upload the CSV leads.`,
        };
    }

    async processCsvForExistingForm(formId: string, file: Express.Multer.File) {
        if (!file) throw new BadRequestException('No CSV file provided');

        const form = await this.fbLeadFormRepo.findOne({ where: { id: formId } });
        if (!form) throw new NotFoundException('Form not found');

        const csvText = this.decodeFileBuffer(file.buffer);

        const firstLine = csvText.split('\n')[0];
        const isTabSeparated = firstLine.includes('\t');

        const rawRecords = csvParse.parse(csvText, {
            columns: true,
            skip_empty_lines: true,
            delimiter: isTabSeparated ? '\t' : ','
        });

        const records = rawRecords.map((row: any) => {
            const cleanRow: any = {};
            for (const key in row) {
                const cleanKey = key.replace(/^\uFEFF/, '');
                cleanRow[cleanKey] = row[key];
            }
            return cleanRow;
        });

        if (records.length === 0) {
            throw new BadRequestException('CSV file is empty');
        }

        return this.ingestCsvData(form, records);
    }

    private async ingestCsvData(form: FbLeadForm, records: any[]) {
        let imported = 0;
        let skipped = 0;
        let errors = 0;

        for (const record of records) {
            const fbLeadgenId = record['id'];
            if (!fbLeadgenId) {
                this.logger.warn(`[FB] Skipping CSV row missing "id" column`);
                errors++;
                continue;
            }

            // 1. Deduplication check using the specialized findByFacebookLeadgenId method
            const existingLead = await this.leadsService.findByFacebookLeadgenId(fbLeadgenId);

            if (existingLead) {
                skipped++;
                continue;
            }

            // 2. Map fields from CSV row to CreateLeadDto
            const fieldValues: Record<string, string> = { ...record };
            const dto: Record<string, any> = {
                source: 'facebook',
                pageType: 'facebook_lead_form_csv',
                leadCategory: form.leadCategory || undefined,
                campaignId: form.formName,
                specificDetails: {
                    fb_form_id: form.fbFormId,
                    fb_form_name: form.formName,
                    fb_leadgen_id: fbLeadgenId,
                    fb_created_time: record['created_time'],
                    fb_raw_fields: fieldValues,
                },
            };

            const mapping = form.fieldMapping ?? {};
            for (const [fbKey, ourField] of Object.entries(mapping)) {
                if (ourField && fieldValues[fbKey] !== undefined) {
                    dto[ourField] = fieldValues[fbKey];
                }
            }

            // Apply standard fallbacks just like the webhook if unmapped
            if (!dto.phone && fieldValues['phone_number']) dto.phone = fieldValues['phone_number'];
            if (!dto.name && fieldValues['full_name']) dto.name = fieldValues['full_name'];
            if (!dto.city && fieldValues['city']) dto.city = fieldValues['city'];

            // 3. Create the lead
            try {
                await this.leadsService.create(dto as any);
                imported++;
            } catch (err) {
                this.logger.error(`[FB] Failed to create lead from CSV row ${fbLeadgenId}: ${err.message}`);
                errors++;
            }
        }

        // 4. Update stats
        if (imported > 0) {
            form.leadsSynced = (form.leadsSynced ?? 0) + imported;
            form.lastSyncedAt = new Date();
            await this.fbLeadFormRepo.save(form);
        }

        return {
            success: true,
            imported,
            skipped,
            errors,
            message: `Imported ${imported} new leads. Skipped ${skipped} duplicates.`,
            formId: form.id,
        };
    }

    private formatHeaderLabel(header: string): string {
        return header
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())
            .replace(/\?/g, '')
            .trim();
    }

    private guessFieldType(header: string): string {
        const h = header.toLowerCase();
        if (h.includes('name')) return 'FULL_NAME';
        if (h.includes('phone')) return 'PHONE';
        if (h.includes('email')) return 'EMAIL';
        if (h.includes('city')) return 'CITY';
        return 'CUSTOM';
    }

    /**
     * Facebook exports CSVs in UTF-16LE with a BOM (FF FE).
     * This safely detects and decodes the buffer to standard UTF-8.
     */
    private decodeFileBuffer(buffer: Buffer): string {
        // Check for UTF-16LE BOM (FF FE)
        if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
            return buffer.toString('utf16le');
        }
        // Check for UTF-16BE BOM (FE FF)
        if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
            // Node doesn't have native utf16be, but just in case, swap bytes
            const swapped = Buffer.alloc(buffer.length);
            for (let i = 0; i < buffer.length - 1; i += 2) {
                swapped[i] = buffer[i + 1];
                swapped[i + 1] = buffer[i];
            }
            return swapped.toString('utf16le');
        }
        // Check for UTF-8 BOM (EF BB BF)
        if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
            return buffer.toString('utf-8', 3);
        }

        // Default to UTF-8
        return buffer.toString('utf-8');
    }

    // ── Webhook Verification ──────────────────────────────────────────────
    verifyWebhook(query: any): string {
        const mode = query['hub.mode'];
        const token = query['hub.verify_token'];
        const challenge = query['hub.challenge'];

        const verifyToken = this.configService.get<string>('FB_VERIFY_TOKEN');

        if (mode === 'subscribe' && token === verifyToken) {
            this.logger.log('[FB] Webhook verified successfully');
            return challenge;
        }

        this.logger.warn('[FB] Webhook verification failed — token mismatch');
        throw new BadRequestException('Verification token mismatch');
    }

    // ── Webhook Handler ───────────────────────────────────────────────────
    async handleWebhook(body: any): Promise<void> {
        this.logger.log(`[FB] Webhook received: ${JSON.stringify(body).substring(0, 500)}`);

        if (!body?.entry || !Array.isArray(body.entry)) {
            this.logger.warn('[FB] Invalid webhook payload — no entry array');
            return;
        }

        for (const entry of body.entry) {
            if (!entry.changes || !Array.isArray(entry.changes)) continue;

            for (const change of entry.changes) {
                if (change.field !== 'leadgen') continue;

                const { leadgen_id, form_id } = change.value ?? {};
                if (!leadgen_id || !form_id) {
                    this.logger.warn('[FB] Missing leadgen_id or form_id in webhook');
                    continue;
                }

                await this.processLead(leadgen_id, form_id);
            }
        }
    }

    // ── Direct Lead Push (from 3rd-party CRM/plugin) ──────────────────────
    // Handles POST bodies that may be form-encoded OR JSON regardless of
    // the Content-Type header the caller sets.
    // rawBody is pre-read by the controller from req.rawBody.
    async handleDirectLeadPush(rawBody: string): Promise<{ success: boolean; leadId?: string; error?: string; duplicate?: boolean }> {
        this.logger.log(`[LEAD-PUSH] Raw body received:\n${rawBody}`);

        // ── 2. Parse — try JSON first, fall back to form-encoded ──────────
        let fields: Record<string, string> = {};
        try {
            fields = JSON.parse(rawBody);
            this.logger.log(`[LEAD-PUSH] Parsed as JSON:\n${JSON.stringify(fields, null, 2)}`);
        } catch {
            // Not JSON — parse as application/x-www-form-urlencoded
            const params = new URLSearchParams(rawBody);
            params.forEach((v, k) => { fields[k] = v; });
            this.logger.log(`[LEAD-PUSH] Parsed as form-encoded:\n${JSON.stringify(fields, null, 2)}`);
        }

        // ── 3. Map common field names → lead fields ───────────────────────
        // Support both UPPER_CASE (CRM style) and camelCase / snake_case
        const get = (...keys: string[]) =>
            keys.map(k => fields[k] ?? fields[k.toLowerCase()] ?? '').find(v => v) ?? '';

        // Facebook lead ID — LeadBridge sends this as lead_id, LEAD_ID, or id
        const fbLeadgenId = get('lead_id', 'LEAD_ID', 'leadgen_id', 'LEADGEN_ID', 'id', 'ID');
        // Facebook form ID — LeadBridge may send as form_id or 'form name' (confusingly)
        const fbFormId    = get('form_id', 'FORM_ID', 'form name', 'FORM_NAME');

        // ── Deduplication: skip if we already have this Facebook lead ─────
        if (fbLeadgenId) {
            const existing = await this.leadsService.findByFacebookLeadgenId(fbLeadgenId);
            if (existing) {
                this.logger.log(`[LEAD-PUSH] ⚠️ Duplicate — lead with fb_leadgen_id=${fbLeadgenId} already exists (id=${existing.id}). Skipping.`);
                return { success: true, leadId: existing.id, duplicate: true };
            }
        } else {
            this.logger.warn('[LEAD-PUSH] No lead_id found in payload — deduplication skipped');
        }

        const firstName = get('FIRST_NAME', 'first_name', 'firstName');
        const lastName  = get('LAST_NAME',  'last_name',  'lastName');
        const phone     = get('PHONE', 'phone_number', 'mobile', 'MOBILE');
        const email     = get('EMAIL', 'email_address');
        const city      = get('CITY', 'city');
        const zip       = get('ZIP_CODE', 'ZIP', 'pincode', 'PINCODE');
        const formName  = get('FULL_NAME', 'form_name');

        // UTM tracking fields
        const utmSource   = get('utm_source',   'UTM_SOURCE');
        const utmMedium   = get('utm_medium',   'UTM_MEDIUM');
        const utmCampaign = get('utm_campaign', 'UTM_CAMPAIGN');
        const utmContent  = get('utm_content',  'UTM_CONTENT');
        const utmTerm     = get('utm_term',     'UTM_TERM');

        const name = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';

        if (!phone) {
            this.logger.warn('[LEAD-PUSH] ❌ No phone number found — aborting');
            return { success: false, error: 'Phone number is required' };
        }

        this.logger.log(`[LEAD-PUSH] Mapped → name="${name}" phone="${phone}" city="${city}" form="${formName}" leadgenId="${fbLeadgenId}" utm_source="${utmSource}"`);

        // ── 4. Ingest via LeadsService ────────────────────────────────────
        try {
            const lead = await this.leadsService.create({
                name,
                phone,
                city,
                pincode: zip,
                source: 'facebook-direct',
                pageType: formName || undefined,
                notes: email ? `Email: ${email}` : undefined,
                specificDetails: {
                    ...(fbLeadgenId  ? { fb_leadgen_id:  fbLeadgenId  } : {}),
                    ...(fbFormId     ? { fb_form_id:     fbFormId     } : {}),
                    ...(utmSource    ? { utm_source:     utmSource    } : {}),
                    ...(utmMedium    ? { utm_medium:     utmMedium    } : {}),
                    ...(utmCampaign  ? { utm_campaign:   utmCampaign  } : {}),
                    ...(utmContent   ? { utm_content:    utmContent   } : {}),
                    ...(utmTerm      ? { utm_term:       utmTerm      } : {}),
                    fb_raw_fields: fields,
                },
            } as any);

            this.logger.log(`[LEAD-PUSH] ✅ Lead created — id=${lead?.id} fb_leadgen_id=${fbLeadgenId || '(none)'}`);
            return { success: true, leadId: lead?.id };
        } catch (err: any) {
            this.logger.error(`[LEAD-PUSH] ❌ Lead creation failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    // ── Process a Single Lead ─────────────────────────────────────────────
    private async processLead(leadgenId: string, fbFormId: string): Promise<void> {
        this.logger.log(`[FB] Processing lead: leadgen_id=${leadgenId}, form_id=${fbFormId}`);

        // 1. Find the form in our DB
        const form = await this.fbLeadFormRepo.findOne({ where: { fbFormId } });
        if (!form) {
            this.logger.warn(`[FB] Form ${fbFormId} not found in DB — skipping`);
            return;
        }
        if (!form.syncEnabled) {
            this.logger.log(`[FB] Form "${form.formName}" sync is OFF — skipping`);
            return;
        }

        // 2. Get access token — match by page ID from the form
        const config = await this.getConfigByPageId(form.fbPageId);
        if (!config) {
            this.logger.error(`[FB] No config found for page ${form.fbPageId} — cannot fetch lead`);
            return;
        }

        // 3. Fetch lead data from Facebook Graph API
        const leadData = await this.fetchLeadFromGraph(leadgenId, config.accessToken);
        if (!leadData) return;

        // 4. Map fields and create lead
        const dto = this.mapFieldsToDto(leadData, form);
        this.logger.log(`[FB] Mapped lead DTO: ${JSON.stringify(dto)}`);

        try {
            await this.leadsService.create(dto as any);
            this.logger.log(`[FB] ✅ Lead created from form "${form.formName}"`);

            // Update counters
            form.leadsSynced = (form.leadsSynced ?? 0) + 1;
            form.lastSyncedAt = new Date();
            await this.fbLeadFormRepo.save(form);
        } catch (err) {
            this.logger.error(`[FB] ❌ Failed to create lead: ${err.message}`);
        }
    }

    // ── Fetch Lead Data from Graph API ────────────────────────────────────
    private async fetchLeadFromGraph(leadgenId: string, accessToken: string): Promise<any> {
        const url = `https://graph.facebook.com/v21.0/${leadgenId}?access_token=${accessToken}`;

        try {
            const res = await fetch(url);
            if (!res.ok) {
                const errBody = await res.text();
                this.logger.error(`[FB] Graph API error fetching lead: ${res.status} — ${errBody}`);
                return null;
            }
            const data = await res.json();
            this.logger.log(`[FB] Fetched lead data: ${JSON.stringify(data).substring(0, 500)}`);
            return data;
        } catch (err) {
            this.logger.error(`[FB] Network error fetching lead: ${err.message}`);
            return null;
        }
    }

    // ── Map Facebook Fields → CreateLeadDto ───────────────────────────────
    private mapFieldsToDto(leadData: any, form: FbLeadForm): Record<string, any> {
        const fieldValues: Record<string, string> = {};

        // Facebook returns: { field_data: [{ name: "full_name", values: ["Priya"] }, ...] }
        if (leadData.field_data && Array.isArray(leadData.field_data)) {
            for (const field of leadData.field_data) {
                fieldValues[field.name] = (field.values ?? [])[0] ?? '';
            }
        }

        // Apply mapping: FB field key → our DTO field
        const dto: Record<string, any> = {
            source: 'facebook',
            pageType: 'facebook_lead_form',
            leadCategory: form.leadCategory || undefined,
            campaignId: form.formName,
            specificDetails: {
                fb_form_id: form.fbFormId,
                fb_form_name: form.formName,
                fb_leadgen_id: leadData.id,
                fb_created_time: leadData.created_time,
                fb_raw_fields: fieldValues,
            },
        };

        const mapping = form.fieldMapping ?? {};
        for (const [fbKey, ourField] of Object.entries(mapping)) {
            if (ourField && fieldValues[fbKey] !== undefined) {
                dto[ourField] = fieldValues[fbKey];
            }
        }

        // Auto-map standard FB fields if not explicitly mapped
        if (!dto.phone && fieldValues['phone_number']) dto.phone = fieldValues['phone_number'];
        if (!dto.name && fieldValues['full_name']) dto.name = fieldValues['full_name'];
        if (!dto.city && fieldValues['city']) dto.city = fieldValues['city'];

        return dto;
    }

    // ── Config Management ─────────────────────────────────────────────────
    async listConfigs(): Promise<FbConfig[]> {
        return this.fbConfigRepo.find({ order: { createdAt: 'DESC' } });
    }

    async getConfigByPageId(pageId: string): Promise<FbConfig | null> {
        return this.fbConfigRepo.findOne({ where: { pageId, isActive: true } });
    }

    async saveConfig(data: { pageId: string; pageName?: string; accessToken: string; appSecret?: string }): Promise<FbConfig> {
        // Upsert by pageId — multiple pages are allowed
        let config = await this.fbConfigRepo.findOne({ where: { pageId: data.pageId } });
        if (config) {
            config.accessToken = data.accessToken;
            config.pageName = data.pageName ?? config.pageName;
            config.appSecret = data.appSecret ?? config.appSecret;
            config.isActive = true;
        } else {
            config = this.fbConfigRepo.create({ ...data, isActive: true });
        }
        return this.fbConfigRepo.save(config);
    }

    async deleteConfig(configId: string): Promise<void> {
        await this.fbConfigRepo.delete({ id: configId });
    }

    async toggleConfigActive(configId: string, isActive: boolean): Promise<FbConfig> {
        const config = await this.fbConfigRepo.findOne({ where: { id: configId } });
        if (!config) throw new NotFoundException('Config not found');
        config.isActive = isActive;
        return this.fbConfigRepo.save(config);
    }

    // ── Import Forms from Facebook ────────────────────────────────────────
    async importForms(pageId: string): Promise<FbLeadForm[]> {
        const config = await this.getConfigByPageId(pageId);
        if (!config) throw new BadRequestException(`No active config found for page ${pageId}.`);

        const url = `https://graph.facebook.com/v21.0/${config.pageId}/leadgen_forms?fields=id,name,questions,status&access_token=${config.accessToken}`;

        this.logger.log(`[FB] Importing forms from page ${config.pageId}`);

        const res = await fetch(url);
        if (!res.ok) {
            const errBody = await res.text();
            this.logger.error(`[FB] Graph API error importing forms: ${res.status} — ${errBody}`);
            throw new BadRequestException(`Facebook API error: ${errBody}`);
        }

        const body = await res.json();
        const fbForms = body.data ?? [];

        this.logger.log(`[FB] Found ${fbForms.length} forms`);

        const imported: FbLeadForm[] = [];

        for (const fbForm of fbForms) {
            let form = await this.fbLeadFormRepo.findOne({ where: { fbFormId: fbForm.id } });

            const questions = (fbForm.questions ?? []).map((q: any) => ({
                key: q.key,
                label: q.label,
                type: q.type,
                options: q.options ?? [],
            }));

            if (form) {
                // Update existing form
                form.formName = fbForm.name;
                form.status = fbForm.status ?? 'active';
                form.questions = questions;
            } else {
                // Create new form with auto-suggested mapping
                const autoMapping = this.suggestMapping(questions);
                form = this.fbLeadFormRepo.create({
                    fbFormId: fbForm.id,
                    formName: fbForm.name,
                    fbPageId: config.pageId,
                    status: fbForm.status ?? 'active',
                    questions,
                    fieldMapping: autoMapping,
                    syncEnabled: false,
                });
            }

            imported.push(await this.fbLeadFormRepo.save(form));
        }

        return imported;
    }

    // ── Auto-Suggest Field Mapping ────────────────────────────────────────
    private suggestMapping(questions: any[]): Record<string, string> {
        const mapping: Record<string, string> = {};
        const typeMap: Record<string, string> = {
            FULL_NAME: 'name',
            PHONE: 'phone',
            PHONE_NUMBER: 'phone',
            EMAIL: 'name', // store email in notes or skip
            CITY: 'city',
            STATE: 'city',
            ZIP: 'pincode',
            POST_CODE: 'pincode',
        };

        for (const q of questions) {
            const mapped = typeMap[q.type?.toUpperCase()];
            if (mapped) {
                mapping[q.key] = mapped;
            }
        }

        return mapping;
    }

    // ── Form CRUD ─────────────────────────────────────────────────────────
    async listForms(): Promise<FbLeadForm[]> {
        return this.fbLeadFormRepo.find({ order: { createdAt: 'DESC' } });
    }

    async updateMapping(formId: string, fieldMapping: Record<string, string>, leadCategory?: string): Promise<FbLeadForm> {
        const form = await this.fbLeadFormRepo.findOne({ where: { id: formId } });
        if (!form) throw new NotFoundException('Form not found');

        form.fieldMapping = fieldMapping;
        if (leadCategory !== undefined) form.leadCategory = leadCategory;
        return this.fbLeadFormRepo.save(form);
    }

    async toggleSync(formId: string, syncEnabled: boolean): Promise<FbLeadForm> {
        const form = await this.fbLeadFormRepo.findOne({ where: { id: formId } });
        if (!form) throw new NotFoundException('Form not found');

        form.syncEnabled = syncEnabled;
        return this.fbLeadFormRepo.save(form);
    }
}
