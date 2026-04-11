/**
 * Data Masking for Regulated Industries
 * Implements HIPAA 18 Identifiers + common PII patterns
 */

// HIPAA 18 Identifiers + common patterns
export interface SensitivePattern {
  id: string;
  name: string;
  category: 'hipaa' | 'pci' | 'pii' | 'custom';
  patterns: RegExp[];
  fieldPatterns: RegExp[]; // Field name patterns
  maskFn: (value: string) => string;
}

// Masking functions
const maskEmail = (value: string): string => {
  const [local, domain] = value.split('@');
  if (!domain) return value.substring(0, 2) + '•••';
  return local.substring(0, 2) + '•••@' + domain.substring(0, 2) + '•••';
};

const maskPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 4) {
    return '(•••) •••-' + digits.slice(-4);
  }
  return '•••-••••';
};

const maskSSN = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 4) {
    return '•••-••-' + digits.slice(-4);
  }
  return '•••-••-••••';
};

const maskCreditCard = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 4) {
    return '••••-••••-••••-' + digits.slice(-4);
  }
  return '••••-••••-••••-••••';
};

const maskName = (value: string): string => {
  const parts = value.trim().split(/\s+/);
  return parts.map(p => p.substring(0, 1) + '•'.repeat(Math.min(p.length - 1, 5))).join(' ');
};

const maskAddress = (value: string): string => {
  const parts = value.split(/,|\n/);
  if (parts.length > 1) {
    return parts[0].substring(0, 3) + '••• ' + parts.slice(-1)[0].trim().substring(0, 2) + '•••';
  }
  return value.substring(0, 5) + '•••';
};

const maskDate = (value: string): string => {
  // Show year only for HIPAA compliance
  const match = value.match(/\d{4}/);
  return match ? `••/••/${match[0]}` : '••/••/••••';
};

const maskGeneric = (value: string, showChars: number = 3): string => {
  if (value.length <= showChars) return '•'.repeat(value.length);
  return value.substring(0, showChars) + '•'.repeat(Math.min(value.length - showChars, 10));
};

const maskIP = (value: string): string => {
  const parts = value.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.•••.•••.${parts[3]}`;
  }
  return '•••.•••.•••.•••';
};

const maskURL = (value: string): string => {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname.substring(0, 4)}•••`;
  } catch {
    return value.substring(0, 8) + '•••';
  }
};

const maskAccountNumber = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 4) {
    return '•'.repeat(digits.length - 4) + digits.slice(-4);
  }
  return '•'.repeat(value.length);
};

const maskMRN = (value: string): string => {
  // Medical Record Number - show last 3
  if (value.length >= 3) {
    return '•'.repeat(value.length - 3) + value.slice(-3);
  }
  return '•'.repeat(value.length);
};

// HIPAA 18 Identifiers + PCI + Common PII
export const SENSITIVE_PATTERNS: SensitivePattern[] = [
  // HIPAA 1: Names
  {
    id: 'hipaa_name',
    name: 'Name',
    category: 'hipaa',
    patterns: [],
    fieldPatterns: [
      /^(first|last|middle|full)?_?name$/i,
      /^(patient|member|customer|user|employee)_?name$/i,
      /^(nombre|apellido)/i,
    ],
    maskFn: maskName,
  },
  
  // HIPAA 2: Geographic data
  {
    id: 'hipaa_address',
    name: 'Address',
    category: 'hipaa',
    patterns: [
      /\d+\s+[\w\s]+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct)/i,
    ],
    fieldPatterns: [
      /address|street|city|zip|postal|geographic/i,
      /^(direccion|calle|ciudad)/i,
    ],
    maskFn: maskAddress,
  },
  
  // HIPAA 3: Dates (birth, admission, discharge, death)
  {
    id: 'hipaa_date',
    name: 'Date',
    category: 'hipaa',
    patterns: [
      /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/,
      /\d{4}[/-]\d{1,2}[/-]\d{1,2}/,
    ],
    fieldPatterns: [
      /^(birth|dob|date_of_birth|admission|discharge|death)_?date$/i,
      /^fecha_?(nacimiento|ingreso|alta)/i,
    ],
    maskFn: maskDate,
  },
  
  // HIPAA 4: Phone numbers
  {
    id: 'hipaa_phone',
    name: 'Phone Number',
    category: 'hipaa',
    patterns: [
      /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
      /\d{3}[-.\s]\d{3}[-.\s]\d{4}/,
    ],
    fieldPatterns: [
      /phone|mobile|cell|telephone|tel|fax/i,
      /^(telefono|celular|movil)/i,
    ],
    maskFn: maskPhone,
  },
  
  // HIPAA 5: Fax numbers (same pattern as phone)
  {
    id: 'hipaa_fax',
    name: 'Fax Number',
    category: 'hipaa',
    patterns: [],
    fieldPatterns: [/fax/i],
    maskFn: maskPhone,
  },
  
  // HIPAA 6: Email addresses
  {
    id: 'hipaa_email',
    name: 'Email Address',
    category: 'hipaa',
    patterns: [
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    ],
    fieldPatterns: [
      /email|e-mail|correo/i,
    ],
    maskFn: maskEmail,
  },
  
  // HIPAA 7: Social Security numbers
  {
    id: 'hipaa_ssn',
    name: 'Social Security Number',
    category: 'hipaa',
    patterns: [
      /\d{3}[-\s]?\d{2}[-\s]?\d{4}/,
    ],
    fieldPatterns: [
      /^ssn$|social_security|ss_number/i,
      /^seguro_social/i,
    ],
    maskFn: maskSSN,
  },
  
  // HIPAA 8: Medical record numbers
  {
    id: 'hipaa_mrn',
    name: 'Medical Record Number',
    category: 'hipaa',
    patterns: [],
    fieldPatterns: [
      /^mrn$|medical_record|patient_id|chart_number/i,
      /^historia_clinica|expediente/i,
    ],
    maskFn: maskMRN,
  },
  
  // HIPAA 9: Health plan beneficiary numbers
  {
    id: 'hipaa_health_plan',
    name: 'Health Plan Number',
    category: 'hipaa',
    patterns: [],
    fieldPatterns: [
      /health_plan|beneficiary|member_id|insurance_id|policy_number/i,
      /^poliza|asegurado/i,
    ],
    maskFn: maskAccountNumber,
  },
  
  // HIPAA 10: Account numbers
  {
    id: 'hipaa_account',
    name: 'Account Number',
    category: 'hipaa',
    patterns: [],
    fieldPatterns: [
      /^account_?(number|num|no|id)$/i,
      /^numero_cuenta/i,
    ],
    maskFn: maskAccountNumber,
  },
  
  // HIPAA 11: Certificate/license numbers
  {
    id: 'hipaa_license',
    name: 'License/Certificate Number',
    category: 'hipaa',
    patterns: [],
    fieldPatterns: [
      /license|certificate|registration|permit/i,
      /^licencia|certificado/i,
    ],
    maskFn: maskGeneric,
  },
  
  // HIPAA 12: Vehicle identifiers
  {
    id: 'hipaa_vehicle',
    name: 'Vehicle Identifier',
    category: 'hipaa',
    patterns: [
      /[A-HJ-NPR-Z0-9]{17}/, // VIN pattern
    ],
    fieldPatterns: [
      /vin|vehicle|license_plate|plate_number/i,
      /^placa|vehiculo/i,
    ],
    maskFn: (v) => maskGeneric(v, 4),
  },
  
  // HIPAA 13: Device identifiers
  {
    id: 'hipaa_device',
    name: 'Device Identifier',
    category: 'hipaa',
    patterns: [],
    fieldPatterns: [
      /device_id|serial_number|imei|mac_address|uuid/i,
      /^dispositivo|serie/i,
    ],
    maskFn: (v) => maskGeneric(v, 4),
  },
  
  // HIPAA 14: Web URLs (personal pages)
  {
    id: 'hipaa_url',
    name: 'Web URL',
    category: 'hipaa',
    patterns: [
      /https?:\/\/[^\s]+/,
    ],
    fieldPatterns: [
      /^url$|website|webpage|profile_url/i,
    ],
    maskFn: maskURL,
  },
  
  // HIPAA 15: IP addresses
  {
    id: 'hipaa_ip',
    name: 'IP Address',
    category: 'hipaa',
    patterns: [
      /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
      /([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}/, // IPv6
    ],
    fieldPatterns: [
      /^ip$|ip_address|client_ip|remote_ip/i,
    ],
    maskFn: maskIP,
  },
  
  // HIPAA 16: Biometric identifiers
  {
    id: 'hipaa_biometric',
    name: 'Biometric Identifier',
    category: 'hipaa',
    patterns: [],
    fieldPatterns: [
      /fingerprint|biometric|retina|voice_print|face_id/i,
      /^huella|biometrico/i,
    ],
    maskFn: () => '[BIOMETRIC DATA]',
  },
  
  // HIPAA 17: Full face photos
  {
    id: 'hipaa_photo',
    name: 'Photo/Image',
    category: 'hipaa',
    patterns: [
      /data:image\/[^;]+;base64,/i,
    ],
    fieldPatterns: [
      /photo|image|picture|avatar|face/i,
      /^foto|imagen/i,
    ],
    maskFn: () => '[IMAGE DATA]',
  },
  
  // HIPAA 18: Any other unique identifier
  {
    id: 'hipaa_unique_id',
    name: 'Unique Identifier',
    category: 'hipaa',
    patterns: [],
    fieldPatterns: [
      /^unique_id|person_id|individual_id|national_id/i,
      /^cedula|dni|rut|curp/i,
    ],
    maskFn: maskGeneric,
  },
  
  // PCI-DSS: Credit card numbers
  {
    id: 'pci_credit_card',
    name: 'Credit Card Number',
    category: 'pci',
    patterns: [
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
      /\b\d{16}\b/,
    ],
    fieldPatterns: [
      /credit_card|card_number|cc_number|pan/i,
      /^tarjeta|numero_tarjeta/i,
    ],
    maskFn: maskCreditCard,
  },
  
  // PCI-DSS: CVV
  {
    id: 'pci_cvv',
    name: 'CVV/CVC',
    category: 'pci',
    patterns: [],
    fieldPatterns: [
      /^cvv|cvc|cvv2|cvc2|security_code$/i,
    ],
    maskFn: () => '•••',
  },
  
  // Common: Password
  {
    id: 'pii_password',
    name: 'Password',
    category: 'pii',
    patterns: [],
    fieldPatterns: [
      /password|passwd|pwd|secret|token|api_key|private_key/i,
      /^clave|contrasena/i,
    ],
    maskFn: () => '••••••••',
  },
  
  // Common: Bank account
  {
    id: 'pii_bank',
    name: 'Bank Account',
    category: 'pii',
    patterns: [],
    fieldPatterns: [
      /bank_account|iban|routing_number|aba_number/i,
      /^cuenta_bancaria|clabe/i,
    ],
    maskFn: maskAccountNumber,
  },
];

/**
 * Detect if a value matches any sensitive pattern
 */
export function detectSensitiveData(
  value: string,
  fieldName?: string
): SensitivePattern | null {
  if (typeof value !== 'string' || !value) return null;
  
  for (const pattern of SENSITIVE_PATTERNS) {
    // Check field name patterns first (more reliable)
    if (fieldName) {
      for (const fp of pattern.fieldPatterns) {
        if (fp.test(fieldName)) {
          return pattern;
        }
      }
    }
    
    // Check value patterns
    for (const vp of pattern.patterns) {
      if (vp.test(value)) {
        return pattern;
      }
    }
  }
  
  return null;
}

/**
 * Mask a value based on detected pattern or generic masking
 */
export function maskValue(
  value: any,
  fieldName?: string,
  forcePattern?: SensitivePattern
): string {
  if (value === null || value === undefined) return String(value);
  
  const strValue = String(value);
  const pattern = forcePattern || detectSensitiveData(strValue, fieldName);
  
  if (pattern) {
    return pattern.maskFn(strValue);
  }
  
  // Default: partial masking for strings over 10 chars
  if (strValue.length > 10) {
    return maskGeneric(strValue, 4);
  }
  
  return strValue;
}

/**
 * Check if masking should be applied based on policies
 */
export interface MaskingPolicy {
  enabled: boolean;
  mode: 'disabled' | 'optional' | 'enforced';
  categories: ('hipaa' | 'pci' | 'pii' | 'custom')[];
  customPatterns?: string[]; // Additional field patterns
}

export const DEFAULT_MASKING_POLICY: MaskingPolicy = {
  enabled: false,
  mode: 'optional',
  categories: ['hipaa', 'pci', 'pii'],
};

/**
 * Apply masking to an object recursively
 */
export function maskObject(
  obj: any,
  policy: MaskingPolicy = DEFAULT_MASKING_POLICY,
  parentPath: string = ''
): any {
  if (!policy.enabled || policy.mode === 'disabled') {
    return obj;
  }
  
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map((item, i) => maskObject(item, policy, `${parentPath}[${i}]`));
  }
  
  if (typeof obj === 'object') {
    const masked: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = parentPath ? `${parentPath}.${key}` : key;
      masked[key] = maskObject(value, policy, fieldPath);
    }
    return masked;
  }
  
  if (typeof obj === 'string') {
    const fieldName = parentPath.split('.').pop() || parentPath;
    const pattern = detectSensitiveData(obj, fieldName);
    
    if (pattern && policy.categories.includes(pattern.category)) {
      return pattern.maskFn(obj);
    }
  }
  
  return obj;
}


