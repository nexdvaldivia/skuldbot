import { Entity } from 'typeorm';
import { LookupBaseEntity } from './lookup-base.entity';

@Entity('cp_ticket_status_lookups')
export class TicketStatusLookup extends LookupBaseEntity {}
