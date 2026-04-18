import { Entity } from 'typeorm';
import { LookupBaseEntity } from './lookup-base.entity';

@Entity('cp_lead_status_lookups')
export class LeadStatusLookup extends LookupBaseEntity {}
