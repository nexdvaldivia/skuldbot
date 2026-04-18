import { Entity } from 'typeorm';
import { LookupBaseEntity } from './lookup-base.entity';

@Entity('cp_client_contact_type_lookups')
export class ClientContactTypeLookup extends LookupBaseEntity {}
