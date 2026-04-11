import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket, TicketPriority } from './entities/ticket.entity';

export interface CreateTicketFromLeadInput {
  tenantId: string;
  leadId: string | null;
  email: string;
  normalizedEmail: string;
  fullName?: string;
  company?: string;
  source: string;
  inquiryType?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
  ) {}

  async createFromLead(input: CreateTicketFromLeadInput): Promise<Ticket> {
    const subject = this.buildSubject(input);
    const category = this.buildCategory(input);
    const priority = this.buildPriority(input);

    const ticket = this.ticketRepository.create({
      tenantId: input.tenantId,
      leadId: input.leadId,
      requesterEmail: input.email,
      normalizedEmail: input.normalizedEmail,
      requesterName: input.fullName?.trim() || null,
      company: input.company?.trim() || null,
      source: input.source,
      category,
      subject,
      message: input.message?.trim() || null,
      priority,
      metadata: input.metadata ?? {},
    });

    return this.ticketRepository.save(ticket);
  }

  private buildSubject(input: CreateTicketFromLeadInput): string {
    const inquiry = input.inquiryType?.trim() || input.source;
    return `[${inquiry}] ${input.email}`;
  }

  private buildCategory(input: CreateTicketFromLeadInput): string {
    const inquiryType = input.inquiryType?.toLowerCase().trim();
    if (inquiryType) {
      return inquiryType;
    }

    switch (input.source) {
      case 'support_request':
        return 'support';
      case 'demo_request':
        return 'demo';
      case 'partnership_request':
        return 'partnership';
      case 'newsletter':
        return 'newsletter';
      default:
        return 'sales';
    }
  }

  private buildPriority(input: CreateTicketFromLeadInput): TicketPriority {
    const inquiryType = input.inquiryType?.toLowerCase().trim();
    if (inquiryType === 'support') {
      return TicketPriority.HIGH;
    }

    if (input.source === 'support_request') {
      return TicketPriority.HIGH;
    }

    return TicketPriority.NORMAL;
  }
}
