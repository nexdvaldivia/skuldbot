import { Entity } from 'typeorm';
import { LookupBaseEntity } from './lookup-base.entity';

@Entity('cp_partner_status_lookups')
export class PartnerStatusLookup extends LookupBaseEntity {}
