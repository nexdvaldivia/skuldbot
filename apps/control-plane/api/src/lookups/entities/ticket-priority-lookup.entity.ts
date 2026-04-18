import { Entity } from 'typeorm';
import { LookupBaseEntity } from './lookup-base.entity';

@Entity('cp_ticket_priority_lookups')
export class TicketPriorityLookup extends LookupBaseEntity {}
