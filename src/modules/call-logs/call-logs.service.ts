import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CallLog, CallLogStatus } from './entities/call-log.entity';
import { InitiateCallDto } from './dto/initiate-call.dto';
import { Customer } from '../customers/entities/customer.entity';
import { CustomersService } from '../customers/customers.service';
import { CustomerScope } from '../customers/dto/create-customer.dto';
import { LeadRecord, LeadStatus } from '../leads/entities/lead-record.entity';
import { LeadsService } from '../leads/leads.service';


@Injectable()
export class CallLogsService {
    private readonly logger = new Logger(CallLogsService.name);

    // LeadSquared telephony log endpoint (fire-and-forget after every call)
    private readonly LEADSQUARED_URL =
        'https://asyncapi-in21.leadsquared.com/2/api/telephony/logcallcomplete' +
        '/24fc022536446383951c3a0d8c2fc14466/edb0135a-39e0-49f1-af3a-4b50e0e27b3a' +
        '?xapikey=uOMsRIeihT9iNfPZjOG6E96RjBEV4slg2IPXZniq';

    constructor(
        @InjectRepository(CallLog)
        private readonly callLogRepo: Repository<CallLog>,
        @InjectRepository(Customer)
        private readonly customerRepo: Repository<Customer>,
        @InjectRepository(LeadRecord)
        private readonly leadRepo: Repository<LeadRecord>,
        private readonly customersService: CustomersService,
        private readonly leadsService: LeadsService,
    ) { }

    // ── Initiate: create a pending record when agent starts a call ─────────────
    async initiate(dto: InitiateCallDto): Promise<CallLog> {
        const record = this.callLogRepo.create({
            leadId: dto.leadId,
            customerId: dto.customerId,
            agentId: dto.agentId,
            agentNumber: dto.agentNumber,
            callerNumber: dto.callerNumber,
            status: CallLogStatus.PENDING,
        });
        return this.callLogRepo.save(record);
    }

    // ── Callback: qkonnect posts result, we find & update the pending record ───
    async handleCallback(params: Record<string, string>): Promise<{ success: boolean; error?: string }> {
        // qkonnect may use different casing — normalise common variants
        const agentNumber  = this.normalizePhone(params['agent_number']  ?? params['agentNumber']  ?? '');
        const callerNumber = this.normalizePhone(params['caller_number'] ?? params['callerNumber'] ?? '');
        const direction    = (params['direction'] ?? params['Direction'] ?? '').toLowerCase();

        this.logger.log(`[CALLBACK] Received callback — agent=${agentNumber} caller=${callerNumber} direction=${direction}`);
        this.logger.log(`[CALLBACK] Raw qkonnect data:\n${JSON.stringify(params, null, 2)}`);



        if (!agentNumber || !callerNumber) {
            this.logger.warn('[CALLBACK] ❌ Missing agent_number or caller_number — aborting');
            return { success: false, error: 'Missing agent_number or caller_number' };
        }

        // Find the most recent pending record for this agent+caller pair
        const record = await this.callLogRepo.findOne({
            where: { agentNumber, callerNumber, status: CallLogStatus.PENDING },
            order: { createdAt: 'DESC' },
        });

        if (!record) {
            // ── No pending record: route by direction ─────────────────────────
            if (direction === 'outbound') {
                // Agent called a lead from an external DB — log it against their
                // most recent lead or create a new 'Outbound Call' lead.
                this.logger.log(`[CALLBACK] No pending record + Outbound → creating outbound orphan log`);
                try {
                    await this.createOutboundOrphanLog(agentNumber, callerNumber, params);
                    this.logger.log(`[CALLBACK] ✅ Outbound orphan log created`);
                    return { success: true };
                } catch (err: any) {
                    this.logger.error(`[CALLBACK] ❌ Outbound orphan log FAILED: ${err.message}`, err.stack);
                    return { success: false, error: `Outbound orphan log failed: ${err.message}` };
                }
            } else {
                // Inbound (IVR) — customer rang the business line
                this.logger.log(`[CALLBACK] No pending record + Inbound → treating as Inbound IVR`);
                try {
                    await this.createInboundLead(agentNumber, callerNumber, params);
                    this.logger.log(`[CALLBACK] ✅ Inbound IVR lead created successfully`);
                    return { success: true };
                } catch (err: any) {
                    this.logger.error(`[CALLBACK] ❌ Inbound IVR lead creation FAILED: ${err.message}`, err.stack);
                    return { success: false, error: `Inbound lead creation failed: ${err.message}` };
                }
            }
        }

        // ── Update existing pending record ────────────────────────────────────
        await this.applyCallbackFields(record.id, params);
        const status = this.isMissed(params) ? 'missed' : 'completed';
        this.logger.log(`[CALLBACK] ✅ Call log ${record.id} updated → ${status}`);

        // Notify LeadSquared (fire-and-forget)
        this.notifyLeadSquared(params);

        return { success: true };
    }

    // ── Private: Outbound orphan — agent called outside the system ────────────
    // Scenario: caller dialled a lead from an external DB; no pending CallLog
    // exists. We find the customer's most recent open lead or create a new one.
    private async createOutboundOrphanLog(
        agentNumber: string,
        callerNumber: string,
        params: Record<string, string>,
    ): Promise<void> {
        const normalizedPhone = this.normalizePhone(callerNumber);
        this.logger.log(`[OUTBOUND] Normalised phone: ${callerNumber} → ${normalizedPhone}`);

        // 1. Find or create customer
        let customer = await this.customerRepo.findOne({ where: { phone: normalizedPhone } })
            ?? await this.customerRepo.findOne({ where: { phone: callerNumber } });

        if (!customer) {
            this.logger.log(`[OUTBOUND] Customer not found — creating new (scope=LOCAL)`);
            customer = await this.customersService.create({
                phone: callerNumber,
                firstName: 'External',
                lastName: 'Lead',
                tags: ['outbound-orphan'],
                scope: CustomerScope.LOCAL,
            });
            this.logger.log(`[OUTBOUND] Created customer id=${customer.id}`);
        } else {
            this.logger.log(`[OUTBOUND] Found existing customer id=${customer.id}`);
        }

        // 2. Find most recent open (non-closed) lead for this customer
        let lead = await this.leadRepo.findOne({
            where: { customerId: customer.id },
            order: { createdAt: 'DESC' },
        });

        if (!lead) {
            // No lead in our system at all — create one as 'Outbound Call'
            this.logger.log(`[OUTBOUND] No existing lead — creating Outbound Call lead for customer ${customer.id}`);
            const city = params['city'] ?? params['City'];
            lead = await this.leadRepo.save(
                this.leadRepo.create({
                    customerId: customer.id,
                    source: 'Outbound Call',
                    status: LeadStatus.NEW,
                    leadCategory: 'WEBSITE',
                    isRevisit: false,
                    ...(city && { city }),
                }),
            );
            this.logger.log(`[OUTBOUND] Created lead id=${lead.id}`);
        } else {
            this.logger.log(`[OUTBOUND] Linking call log to existing lead id=${lead.id}`);
        }

        // 3. Create the call log
        const parseDate = (v?: string): Date | undefined => {
            if (!v || v.trim() === '' || v.startsWith('00:00:00') || v.startsWith('0NaN')) return undefined;
            const d = new Date(v);
            return isNaN(d.getTime()) ? undefined : d;
        };
        const parseNum = (v?: string) => (v != null ? parseInt(v, 10) : undefined);
        const callAction = params['call_action'] ?? params['callAction'] ?? '';

        const callLog = await this.callLogRepo.save(
            this.callLogRepo.create({
                leadId: lead.id,
                customerId: customer.id,
                agentNumber,
                callerNumber,
                status: this.isMissed(params) ? CallLogStatus.MISSED : CallLogStatus.COMPLETED,
                callId:              params['call_id'] ?? params['callId'],
                destinationNumber:   params['destination_number'] ?? params['destinationNumber'],
                callStartTime:       parseDate(params['call_start_time'] ?? params['callStartTime']),
                callEndTime:         parseDate(params['call_end_time'] ?? params['callEndTime']),
                callPickupTime:      parseDate(params['call_pickup_time'] ?? params['callPickupTime']),
                callHangupTime:      parseDate(params['call_hangup_time'] ?? params['callHangupTime']),
                totalCallDuration:   parseNum(params['total_call_duration'] ?? params['totalCallDuration']),
                callTransferDuration:parseNum(params['call_transfer_duration'] ?? params['callTransferDuration']),
                callRecordingUrl:    params['call_recording_url'] ?? params['callRecordingUrl'],
                callAction,
            }),
        );
        this.logger.log(`[OUTBOUND] ✅ Call log id=${callLog.id} linked to lead=${lead.id} customer=${customer.id}`);

        // Real-time assignment — delegate to central LeadsService engine
        // agentNumber passed so LeadsService can try direct phone match first,
        // then fall back to round-robin if no match (defaulting category to WEBSITE).
        await this.leadsService.assignLeadById(lead.id, agentNumber);

        // Notify LeadSquared (fire-and-forget)
        this.notifyLeadSquared(params);
    }

    // ── Private: create Inbound IVR lead + call log ────────────────────────────
    private async createInboundLead(
        agentNumber: string,
        callerNumber: string,
        params: Record<string, string>,
    ): Promise<void> {
        // Normalize the phone number to match DB format (+91XXXXXXXXXX)
        const normalizedPhone = this.normalizePhone(callerNumber);
        this.logger.log(`[INBOUND] Step 1: Normalizing phone — raw="${callerNumber}" → normalized="${normalizedPhone}"`);

        // 1. Find or create the customer
        let customer: Customer | null = null;

        // Try finding with normalized phone
        customer = await this.customerRepo.findOne({ where: { phone: normalizedPhone } });
        this.logger.log(`[INBOUND] Step 2: Lookup by normalized phone "${normalizedPhone}" → ${customer ? `FOUND id=${customer.id}` : 'NOT FOUND'}`);

        // Also try with raw phone if normalized didn't match
        if (!customer && normalizedPhone !== callerNumber) {
            customer = await this.customerRepo.findOne({ where: { phone: callerNumber } });
            this.logger.log(`[INBOUND] Step 2b: Lookup by raw phone "${callerNumber}" → ${customer ? `FOUND id=${customer.id}` : 'NOT FOUND'}`);
        }

        if (!customer) {
            this.logger.log(`[INBOUND] Step 3: Creating new customer via CustomersService (scope=LOCAL)…`);
            try {
                customer = await this.customersService.create({
                    phone: callerNumber,
                    firstName: 'Inbound',
                    lastName: 'Caller',
                    tags: ['lead', 'inbound-ivr'],
                    scope: CustomerScope.LOCAL,
                });
                this.logger.log(`[INBOUND] Step 3: ✅ Created customer id=${customer.id} phone=${customer.phone}`);
            } catch (err: any) {
                this.logger.error(`[INBOUND] Step 3: ❌ CustomersService.create() failed: ${err.message}`);

                // Try to recover — maybe customer was created by another concurrent request
                customer = await this.customerRepo.findOne({ where: { phone: normalizedPhone } });
                if (!customer) customer = await this.customerRepo.findOne({ where: { phone: callerNumber } });
                if (!customer) {
                    const digits = callerNumber.replace(/\D/g, '');
                    const last10 = digits.slice(-10);
                    this.logger.log(`[INBOUND] Step 3: Last resort — LIKE search for %${last10}`);
                    customer = await this.customerRepo
                        .createQueryBuilder('c')
                        .where('c.phone LIKE :phone', { phone: `%${last10}` })
                        .getOne();
                }
                if (!customer) {
                    throw new Error(`Cannot find or create customer for phone ${callerNumber}: ${err.message}`);
                }
                this.logger.log(`[INBOUND] Step 3: ✅ Recovery successful — found customer id=${customer.id}`);
            }
        } else {
            // Tag the customer as inbound-ivr if not already
            if (!customer.tags?.includes('inbound-ivr')) {
                customer.tags = [...(customer.tags ?? []), 'inbound-ivr'];
                await this.customerRepo.save(customer);
                this.logger.log(`[INBOUND] Step 2: Tagged existing customer ${customer.id} with inbound-ivr`);
            }
        }

        // ── 2. Find existing OPEN lead — reuse it to avoid duplicates ───────────
        // "Open" = any status that is not a terminal/closed status.
        const CLOSED_STATUSES = [
            'dropped',
            'converted:Marked to EC',
            'converted:Marked to HT',
            'converted:Marked to VC',
        ];

        let lead = await this.leadRepo
            .createQueryBuilder('lr')
            .where('lr.customer_id = :cid', { cid: customer.id })
            .andWhere('lr.status NOT IN (:...closed)', { closed: CLOSED_STATUSES })
            .orderBy('lr.created_at', 'DESC')
            .getOne();

        if (lead) {
            // ── Reuse existing open lead ─────────────────────────────────────────
            this.logger.log(`[INBOUND] Step 4: Found existing open lead id=${lead.id} status=${lead.status} — reusing instead of creating duplicate`);
            // Mark as revisit if not already flagged
            if (!lead.isRevisit) {
                lead.isRevisit = true;
                await this.leadRepo.save(lead);
                this.logger.log(`[INBOUND] Step 4: Marked lead ${lead.id} as isRevisit=true`);
            }
        } else {
            // ── No open lead — create a fresh one ───────────────────────────────
            const priorCount = await this.leadRepo.count({ where: { customerId: customer.id } });
            this.logger.log(`[INBOUND] Step 4: No open lead found. Prior count=${priorCount} → creating new Inbound IVR lead`);
            const city = params['city'] ?? params['City'];
            lead = await this.leadRepo.save(
                this.leadRepo.create({
                    customerId: customer.id,
                    source: 'Inbound IVR',
                    status: LeadStatus.NEW,
                    leadCategory: 'WEBSITE',
                    isRevisit: priorCount > 0,
                    ...(city && { city }),
                }),
            );
            this.logger.log(`[INBOUND] Step 4: ✅ Created new lead id=${lead.id} isRevisit=${lead.isRevisit}`);
        }

        // ── 3. Create the call log with callback data filled in ─────────────────
        this.logger.log(`[INBOUND] Step 5: Creating CallLog — leadId=${lead.id}`);
        const callAction = params['call_action'] ?? params['callAction'] ?? '';
        const parseDate = (v?: string): Date | undefined => {
            if (!v || v.trim() === '' || v.startsWith('00:00:00') || v.startsWith('0NaN')) return undefined;
            const d = new Date(v);
            return isNaN(d.getTime()) ? undefined : d;
        };
        const parseNum = (v?: string) => (v != null ? parseInt(v, 10) : undefined);

        const callLog = await this.callLogRepo.save(
            this.callLogRepo.create({
                leadId: lead.id,
                customerId: customer.id,
                agentNumber,
                callerNumber,
                status: this.isMissed(params) ? CallLogStatus.MISSED : CallLogStatus.COMPLETED,
                callId: params['call_id'] ?? params['callId'],
                destinationNumber: params['destination_number'] ?? params['destinationNumber'],
                lastKeyPressed: params['last_key_pressed'] ?? params['lastKeyPressed'],
                dtmfDetails: params['dtmf_details'] ?? params['dtmfDetails'],
                callStartTime: parseDate(params['call_start_time'] ?? params['callStartTime']),
                callEndTime: parseDate(params['call_end_time'] ?? params['callEndTime']),
                callPickupTime: parseDate(params['call_pickup_time'] ?? params['callPickupTime']),
                callHangupTime: parseDate(params['call_hangup_time'] ?? params['callHangupTime']),
                totalCallDuration: parseNum(params['total_call_duration'] ?? params['totalCallDuration']),
                ivrDuration: parseNum(params['ivr_duration'] ?? params['ivrDuration']),
                callTransferDuration: parseNum(params['call_transfer_duration'] ?? params['callTransferDuration']),
                callAction,
                callRecordingUrl: params['call_recording_url'] ?? params['callRecordingUrl'],
                callConferenceUid: params['call_conference_uid'] ?? params['callConferenceUid'],
            }),
        );
        this.logger.log(`[INBOUND] Step 5: ✅ Created call log id=${callLog.id} status=${callLog.status}`);
        this.logger.log(`[INBOUND] ✅ COMPLETE — Lead=${lead.id} Customer=${customer.id} CallLog=${callLog.id}`);

        // Real-time assignment — delegate to central LeadsService engine
        await this.leadsService.assignLeadById(lead.id, agentNumber);

        // Notify LeadSquared (fire-and-forget)
        this.notifyLeadSquared(params);
    }

    // ── Private: fire-and-forget POST to LeadSquared telephony API ─────────────
    private notifyLeadSquared(params: Record<string, string>): void {
        // Only forward Outbound calls to LeadSquared
        const direction = params['direction'] ?? params['Direction'] ?? '';
        if (direction.toLowerCase() !== 'outbound') {
            this.logger.log(`[LEADSQUARED] Skipping — direction="${direction || '(not set)'}" (only Outbound calls are forwarded)`);
            return;
        }

        const recordingUrl = params['call_recording_url'] ?? params['callRecordingUrl'] ?? '';
        const callerNumber = params['caller_number'] ?? params['callerNumber'] ?? '';
        const agentNumber  = params['agent_number']  ?? params['agentNumber']  ?? '';
        const duration     = params['total_call_duration'] ?? params['totalCallDuration'] ?? '';
        const callId       = params['call_id'] ?? params['callId'] ?? '';
        const startTime    = params['call_start_time'] ?? params['callStartTime'] ?? '';
        const endTime      = params['call_end_time']   ?? params['callEndTime']   ?? '';

        const payload = {
            Direction:         'Outbound',
            ResourceURL:       recordingUrl,
            DestinationNumber: callerNumber,
            SourceNumber:      agentNumber,
            StartTime:         startTime,
            EndTime:           endTime,
            Duration:          duration,
            CallId:            callId,
        };

        this.logger.log(`[LEADSQUARED] Notifying — CallId=${callId} RecordingURL=${recordingUrl || '(none)'}`);
        this.logger.log(`[LEADSQUARED] Notifying — URL: ${this.LEADSQUARED_URL}`);
        this.logger.log(`[LEADSQUARED] Payload: ${JSON.stringify(payload, null, 2)}`);

        fetch(this.LEADSQUARED_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
            .then(async (res) => {
                const text = await res.text();
                if (res.ok) {
                    this.logger.log(`[LEADSQUARED] ✅ Success (${res.status}): ${text}`);
                } else {
                    this.logger.warn(`[LEADSQUARED] ⚠️ Non-OK response (${res.status}): ${text}`);
                }
            })
            .catch((err: Error) => {
                this.logger.error(`[LEADSQUARED] ❌ Failed to notify: ${err.message}`);
            });
    }

    private async applyCallbackFields(id: string, params: Record<string, string>): Promise<void> {
        const parseDate = (v?: string): Date | undefined => {
            if (!v || v.trim() === '' || v.startsWith('00:00:00') || v.startsWith('0NaN')) return undefined;
            const d = new Date(v);
            return isNaN(d.getTime()) ? undefined : d;
        };
        const parseNum = (v?: string) => (v != null ? parseInt(v, 10) : undefined);
        const callAction = params['call_action'] ?? params['callAction'] ?? '';

        await this.callLogRepo.update(id, {
            status: this.isMissed(params) ? CallLogStatus.MISSED : CallLogStatus.COMPLETED,
            callId: params['call_id'] ?? params['callId'],
            destinationNumber: params['destination_number'] ?? params['destinationNumber'],
            lastKeyPressed: params['last_key_pressed'] ?? params['lastKeyPressed'],
            dtmfDetails: params['dtmf_details'] ?? params['dtmfDetails'],
            callStartTime: parseDate(params['call_start_time'] ?? params['callStartTime']),
            callEndTime: parseDate(params['call_end_time'] ?? params['callEndTime']),
            callPickupTime: parseDate(params['call_pickup_time'] ?? params['callPickupTime']),
            callHangupTime: parseDate(params['call_hangup_time'] ?? params['callHangupTime']),
            totalCallDuration: parseNum(params['total_call_duration'] ?? params['totalCallDuration']),
            ivrDuration: parseNum(params['ivr_duration'] ?? params['ivrDuration']),
            callTransferDuration: parseNum(params['call_transfer_duration'] ?? params['callTransferDuration']),
            callAction,
            callRecordingUrl: params['call_recording_url'] ?? params['callRecordingUrl'],
            callConferenceUid: params['call_conference_uid'] ?? params['callConferenceUid'],
        });
    }

    // ── Private helper ─────────────────────────────────────────────────────────
    private isMissed(params: Record<string, string>): boolean {
        const action = params['call_action'] ?? params['callAction'] ?? '';
        return action.toLowerCase().includes('missed');
    }

    private normalizePhone(phone: string): string {
        const digits = phone.replace(/\D/g, '');
        if (digits.length === 10) return `+91${digits}`;
        if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.substring(1)}`;
        if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
        return `+${digits}`;
    }

    // ── List call logs for a lead (for future admin view) ─────────────────────
    async findByLead(leadId: string): Promise<CallLog[]> {
        return this.callLogRepo.find({
            where: { leadId },
            order: { createdAt: 'DESC' },
            relations: ['agent', 'customer'],
        });
    }
}
