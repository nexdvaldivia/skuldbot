export class ToolCallDto {
  name: string;
  arguments: Record<string, any>;
  id?: string;
}

export class MCPCapabilitiesDto {
  tools: any[];
  resources: any[];
  metadata: {
    name: string;
    version: string;
    description: string;
    vendor?: string;
  };
}
