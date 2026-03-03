import {
    Injectable,
    Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { PopinEvent } from './entities/popin-event.entity';
import { PopinWebhookDto } from './dto/popin-webhook.dto';
import { LeadsService } from '../leads/leads.service';
import { CreateLeadDto } from '../leads/dto/create-lead.dto';

/**
 * Events we handle to create/update leads.
 * Others are logged but not processed into leads.
 */
const LEAD_EVENTS = new Set([
    'popin_user_captured',
    'popin_call_successful',
    'popin_call_missed',
    'popin_call_abandoned',
    'popin_scheduled_created',
    'popin_call_remark_added',
    'popin_call_rated',
]);

@Injectable()
export class PopinService {
    private readonly logger = new Logger(PopinService.name);

    constructor(
        @InjectRepository(PopinEvent)
        private readonly popinEventRepo: Repository<PopinEvent>,
        private readonly leadsService: LeadsService,
    ) { }

    /**
     * Main entry point — called by the controller for every webhook POST.
     * 1. Compute dedup key
     * 2. Skip if already processed
     * 3. Log raw event
     * 4. Route to handler
     */
    async handleWebhook(dto: PopinWebhookDto, rawBody: Record<string, any>): Promise<{ received: boolean; eventId?: string; duplicate?: boolean }> {
        // ── 1. Compute dedup key ──────────────────────────────────────────────
        const dedupKey = this.computeDedupKey(dto);
        const phone = this.extractPhone(dto);
        this.logger.log(`[POPIN] Step 1: Dedup key="${dedupKey}" | Phone extracted="${phone}"`);

        // ── 2. Check for duplicate ────────────────────────────────────────────
        const existing = await this.popinEventRepo.findOne({ where: { dedupKey } });
        if (existing) {
            this.logger.log(`[POPIN] Step 2: ⚠️ DUPLICATE — event already exists id=${existing.id}, skipping`);
            return { received: true, eventId: existing.id, duplicate: true };
        }
        this.logger.log(`[POPIN] Step 2: ✅ No duplicate found — proceeding`);

        // ── 3. Log raw event ──────────────────────────────────────────────────
        this.logger.log(`[POPIN] Step 3: Saving raw event to popin_events table…`);
        const eventData: Partial<PopinEvent> = {
            event: dto.event,
            popinUserId: dto.user_id ?? undefined,
            phone: phone ?? undefined,
            email: dto.email ?? dto.properties?.customer_email ?? undefined,
            rawPayload: rawBody,
            dedupKey,
            processed: false,
        };
        const popinEvent = this.popinEventRepo.create(eventData);
        const saved = await this.popinEventRepo.save(popinEvent);
        this.logger.log(`[POPIN] Step 3: ✅ Saved popin_event id=${saved.id}`);

        // ── 4. Check if this is a lead event ──────────────────────────────────
        if (!LEAD_EVENTS.has(dto.event)) {
            this.logger.log(`[POPIN] Step 4: ℹ️ Event "${dto.event}" is NOT a lead event — logged only, no lead created`);
            return { received: true, eventId: saved.id };
        }
        this.logger.log(`[POPIN] Step 4: ✅ Event "${dto.event}" IS a lead event — routing to handler…`);

        // ── 5. Route to handler ───────────────────────────────────────────────
        try {
            await this.processEvent(saved, dto);
            saved.processed = true;
            await this.popinEventRepo.save(saved);
            this.logger.log(`[POPIN] Step 5: ✅ Event processed successfully, marked as processed`);
        } catch (err: any) {
            this.logger.error(`[POPIN] Step 5: ❌ HANDLER FAILED: ${err.message}`, err.stack);
            saved.processingError = err.message?.substring(0, 500);
            await this.popinEventRepo.save(saved);
        }

        return { received: true, eventId: saved.id };
    }

    // ── Event Routing ─────────────────────────────────────────────────────────

    private async processEvent(event: PopinEvent, dto: PopinWebhookDto): Promise<void> {
        this.logger.log(`[POPIN] Routing event "${dto.event}" to handler…`);
        switch (dto.event) {
            case 'popin_user_captured':
                await this.handleUserCaptured(event, dto);
                break;
            case 'popin_call_successful':
                await this.handleCallSuccessful(event, dto);
                break;
            case 'popin_call_missed':
            case 'popin_call_abandoned':
                await this.handleCallMissed(event, dto);
                break;
            case 'popin_scheduled_created':
                await this.handleScheduledCreated(event, dto);
                break;
            case 'popin_call_remark_added':
                await this.handleRemarkAdded(event, dto);
                break;
            case 'popin_call_rated':
                await this.handleCallRated(event, dto);
                break;
            default:
                this.logger.warn(`[POPIN] ⚠️ Unhandled lead event: ${dto.event}`);
        }
    }

    // ── Handlers ──────────────────────────────────────────────────────────────

    /** User submitted details via Popin widget → new lead */
    private async handleUserCaptured(event: PopinEvent, dto: PopinWebhookDto): Promise<void> {
        this.logger.log(`[POPIN:user_captured] Processing…`);
        const phone = this.extractPhone(dto);
        if (!phone) {
            this.logger.warn(`[POPIN:user_captured] ❌ No phone number — skipping lead creation`);
            return;
        }

        this.logger.log(`[POPIN:user_captured] Building lead DTO — phone="${phone}" name="${dto.properties?.customer_name ?? 'Popin User'}"`);
        const leadDto = this.buildCreateLeadDto(dto, { status: 'new' });
        this.logger.log(`[POPIN:user_captured] Lead DTO: ${JSON.stringify(leadDto)}`);

        const lead = await this.leadsService.create(leadDto);
        event.leadRecordId = lead.id;
        this.logger.log(`[POPIN:user_captured] ✅ Created lead id=${lead.id}`);
    }

    /** Completed video call → lead marked as contacted */
    private async handleCallSuccessful(event: PopinEvent, dto: PopinWebhookDto): Promise<void> {
        this.logger.log(`[POPIN:call_successful] Processing…`);
        const phone = this.extractPhone(dto);
        if (!phone) {
            this.logger.warn(`[POPIN:call_successful] ❌ No phone — skipping`);
            return;
        }

        const leadDto = this.buildCreateLeadDto(dto, { status: 'contacted' });
        if (dto.properties?.call_duration) {
            leadDto.specificDetails = {
                ...leadDto.specificDetails,
                popin_call_duration: dto.properties.call_duration,
            };
        }
        this.logger.log(`[POPIN:call_successful] Lead DTO: ${JSON.stringify(leadDto)}`);

        const lead = await this.leadsService.create(leadDto);
        event.leadRecordId = lead.id;
        this.logger.log(`[POPIN:call_successful] ✅ Created lead id=${lead.id} (status=contacted, duration=${dto.properties?.call_duration ?? 'n/a'})`);
    }

    /** Missed/abandoned call → lead with follow-up in 30 min */
    private async handleCallMissed(event: PopinEvent, dto: PopinWebhookDto): Promise<void> {
        this.logger.log(`[POPIN:call_missed] Processing (event=${dto.event})…`);
        const phone = this.extractPhone(dto);
        if (!phone) {
            this.logger.warn(`[POPIN:call_missed] ❌ No phone — skipping`);
            return;
        }

        const thirtyMinsLater = new Date(Date.now() + 30 * 60 * 1000);
        const leadDto = this.buildCreateLeadDto(dto, {
            nextActionDate: thirtyMinsLater.toISOString(),
        });
        this.logger.log(`[POPIN:call_missed] Lead DTO: ${JSON.stringify(leadDto)}`);

        const lead = await this.leadsService.create(leadDto);
        event.leadRecordId = lead.id;
        this.logger.log(`[POPIN:call_missed] ✅ Created lead id=${lead.id} (follow-up at ${thirtyMinsLater.toISOString()})`);
    }

    /** Scheduled call → lead with nextActionDate = scheduled time */
    private async handleScheduledCreated(event: PopinEvent, dto: PopinWebhookDto): Promise<void> {
        this.logger.log(`[POPIN:scheduled] Processing…`);
        const phone = this.extractPhone(dto);
        if (!phone) {
            this.logger.warn(`[POPIN:scheduled] ❌ No phone — skipping`);
            return;
        }

        let nextActionDate: string | undefined;
        // Parse Popin scheduled_date (d-M-Y) + scheduled_time (h:i A) into ISO
        if (dto.properties?.scheduled_date_local && dto.properties?.scheduled_time_local) {
            nextActionDate = this.parsePopinDateTime(
                dto.properties.scheduled_date_local,
                dto.properties.scheduled_time_local,
            );
        } else if (dto.properties?.scheduled_date && dto.properties?.scheduled_time) {
            nextActionDate = this.parsePopinDateTime(
                dto.properties.scheduled_date,
                dto.properties.scheduled_time,
            );
        }
        this.logger.log(`[POPIN:scheduled] Parsed nextActionDate="${nextActionDate}"`);

        const leadDto = this.buildCreateLeadDto(dto, {
            nextActionDate,
            appointmentBooked: true,
            bookedDate: nextActionDate?.split('T')[0],
        });

        // Store agent info
        if (dto.properties?.agent_name) {
            leadDto.specificDetails = {
                ...leadDto.specificDetails,
                popin_agent_name: dto.properties.agent_name,
                popin_agent_email: dto.properties.agent_email,
            };
        }
        this.logger.log(`[POPIN:scheduled] Lead DTO: ${JSON.stringify(leadDto)}`);

        const lead = await this.leadsService.create(leadDto);
        event.leadRecordId = lead.id;
        this.logger.log(`[POPIN:scheduled] ✅ Created lead id=${lead.id} (scheduled: ${nextActionDate})`);
    }

    /** Agent added remark → log it. Lead may or may not exist. */
    private async handleRemarkAdded(event: PopinEvent, dto: PopinWebhookDto): Promise<void> {
        this.logger.log(`[POPIN:remark] Processing…`);
        const phone = this.extractPhone(dto);
        if (!phone) {
            this.logger.warn(`[POPIN:remark] ❌ No phone — skipping`);
            return;
        }

        const leadDto = this.buildCreateLeadDto(dto, {});
        if (dto.properties?.remark) {
            leadDto.notes = `[Popin Remark] ${dto.properties.remark}`;
        }
        this.logger.log(`[POPIN:remark] Lead DTO: ${JSON.stringify(leadDto)}`);

        const lead = await this.leadsService.create(leadDto);
        event.leadRecordId = lead.id;
        this.logger.log(`[POPIN:remark] ✅ Created lead id=${lead.id}`);
    }

    /** Call rated → create lead with rating in specificDetails */
    private async handleCallRated(event: PopinEvent, dto: PopinWebhookDto): Promise<void> {
        this.logger.log(`[POPIN:rated] Processing…`);
        const phone = this.extractPhone(dto);
        if (!phone) {
            this.logger.warn(`[POPIN:rated] ❌ No phone — skipping`);
            return;
        }

        const leadDto = this.buildCreateLeadDto(dto, {});
        leadDto.specificDetails = {
            ...leadDto.specificDetails,
            popin_rating: dto.properties?.rating,
            popin_rating_comments: dto.properties?.comments,
        };
        this.logger.log(`[POPIN:rated] Lead DTO: ${JSON.stringify(leadDto)}`);

        const lead = await this.leadsService.create(leadDto);
        event.leadRecordId = lead.id;
        this.logger.log(`[POPIN:rated] ✅ Created lead id=${lead.id} (rating=${dto.properties?.rating})`);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private buildCreateLeadDto(
        dto: PopinWebhookDto,
        overrides: Partial<CreateLeadDto> & { status?: string },
    ): CreateLeadDto {
        const props = dto.properties ?? {};
        const phone = this.extractPhone(dto);
        const name = props.customer_name || 'Popin User';

        const leadDto: any = {
            name,
            phone: phone!,
            source: 'Popin',
            pageType: this.extractPageType(props.url),
            customerProductInterest: props.product || undefined,
            specificDetails: {
                popin_event: dto.event,
                popin_user_id: dto.user_id,
                popin_url: props.url,
                ...(props.meta ?? {}),
                ...(props.extra ?? {}),
            },
            ...overrides,
        };

        // Remove status from CREATE dto — it's auto-set by the service
        // But we can set it to 'contacted' for call_successful via update after create
        delete leadDto.status;

        return leadDto;
    }

    private extractPhone(dto: PopinWebhookDto): string | null {
        // Prefer full_phone_number, then construct from country_code + phone_number
        if (dto.full_phone_number) {
            return dto.full_phone_number.replace(/[^0-9+]/g, '');
        }
        const phone = dto.phone_number ?? dto.properties?.customer_phone_number;
        if (!phone) return null;
        const cc = dto.country_code ?? dto.properties?.customer_country_code ?? '';
        const raw = cc ? `+${cc.replace(/\+/g, '')}${phone}` : phone;
        return raw.replace(/[^0-9+]/g, '');
    }

    private extractPageType(url?: string): string | undefined {
        if (!url) return undefined;
        try {
            const u = new URL(url);
            return u.pathname.replace(/^\//, '') || 'homepage';
        } catch {
            return url;
        }
    }

    private computeDedupKey(dto: PopinWebhookDto): string {
        const phone = this.extractPhone(dto) ?? '';
        const raw = `${dto.event}|${phone}|${dto.timestamp ?? ''}|${dto.user_id ?? ''}`;
        return createHash('sha256').update(raw).digest('hex').substring(0, 64);
    }

    /**
     * Parse Popin datetime format: date=d-M-Y (e.g. "27-Feb-2026"), time=h:i A (e.g. "09:30 PM")
     * Returns ISO string.
     */
    private parsePopinDateTime(dateStr: string, timeStr: string): string {
        try {
            // dateStr: "27-Feb-2026" or "27-2-2026"
            // timeStr: "09:30 PM"
            const combined = `${dateStr} ${timeStr}`;
            const parsed = new Date(combined);
            if (!isNaN(parsed.getTime())) {
                return parsed.toISOString();
            }
            // Fallback: manual parse
            const [day, month, year] = dateStr.split('-');
            const [time, ampm] = timeStr.split(' ');
            const [hours, minutes] = time.split(':').map(Number);
            let h = hours;
            if (ampm?.toUpperCase() === 'PM' && h < 12) h += 12;
            if (ampm?.toUpperCase() === 'AM' && h === 12) h = 0;
            const d = new Date(`${year}-${month}-${day}T${String(h).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
            return d.toISOString();
        } catch {
            this.logger.warn(`Failed to parse Popin datetime: ${dateStr} ${timeStr}`);
            return new Date().toISOString();
        }
    }
}
