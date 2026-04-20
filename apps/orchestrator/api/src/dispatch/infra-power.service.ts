import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Runner, RunnerStatus } from '../runners/entities/runner.entity';

/**
 * Infrastructure provider types
 * - Cloud: azure, aws, gcp
 * - On-premise: vmware, hyperv, proxmox, wol (Wake-on-LAN), ipmi
 * - Generic: agent (calls a power agent API)
 */
export type InfraProvider =
  | 'azure'
  | 'aws'
  | 'gcp'
  | 'vmware'
  | 'hyperv'
  | 'proxmox'
  | 'wol'
  | 'ipmi'
  | 'agent';

/**
 * VM/Machine configuration stored in runner
 */
export interface VmConfig {
  provider: InfraProvider;

  // Cloud providers
  resourceId?: string; // Azure: /subscriptions/.../vm, AWS: i-xxx, GCP: projects/.../instances/...
  region?: string;

  // VMware vSphere
  vcenterUrl?: string;
  vmPath?: string; // e.g., /Datacenter/vm/folder/vm-name

  // Hyper-V
  hypervisorHost?: string;
  vmName?: string;

  // Proxmox
  proxmoxUrl?: string;
  node?: string;
  vmId?: string; // VMID number

  // Wake-on-LAN
  macAddress?: string;
  broadcastAddress?: string;

  // IPMI/iLO/iDRAC
  ipmiHost?: string;
  ipmiUsername?: string;
  // Password should be fetched from secrets vault, not stored here

  // Generic power agent (for custom setups)
  powerAgentUrl?: string; // URL to call for power operations
  powerAgentToken?: string; // Auth token (or reference to vault secret)
}

/**
 * Service for managing runner infrastructure (VMs)
 * Handles power on/off for pinned runners
 */
@Injectable()
export class InfraPowerService {
  private readonly logger = new Logger(InfraPowerService.name);

  // In-memory tracking of power operations in progress
  private poweringOn = new Set<string>();

  constructor(
    @InjectRepository(Runner)
    private readonly runnerRepository: Repository<Runner>,
  ) {}

  /**
   * Ensure a runner is online
   * If offline and has VM config, attempt to power on
   */
  async ensureRunnerOnline(runner: Runner): Promise<boolean> {
    if (runner.status === RunnerStatus.ONLINE) {
      return true;
    }

    if (runner.status === RunnerStatus.BUSY) {
      return true; // Already running something
    }

    // Check if we're already trying to power this one on
    if (this.poweringOn.has(runner.id)) {
      this.logger.log(`Runner ${runner.id} power-on already in progress`);
      return false;
    }

    // Get VM config from runner's systemInfo
    const vmConfig = this.getVmConfig(runner);

    if (!vmConfig) {
      this.logger.warn(`Runner ${runner.id} has no VM config, cannot power on`);
      return false;
    }

    try {
      this.poweringOn.add(runner.id);
      await this.powerOnVm(runner, vmConfig);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to power on runner ${runner.id}: ${error}`,
      );
      return false;
    } finally {
      this.poweringOn.delete(runner.id);
    }
  }

  /**
   * Power on a VM
   */
  private async powerOnVm(runner: Runner, config: VmConfig): Promise<void> {
    this.logger.log(
      `Powering on VM for runner ${runner.id} (${config.provider})`,
    );

    switch (config.provider) {
      // Cloud providers
      case 'azure':
        await this.powerOnAzureVm(config);
        break;

      case 'aws':
        await this.powerOnAwsVm(config);
        break;

      case 'gcp':
        await this.powerOnGcpVm(config);
        break;

      // On-premise virtualization
      case 'vmware':
        await this.powerOnVmwareVm(config);
        break;

      case 'hyperv':
        await this.powerOnHyperVVm(config);
        break;

      case 'proxmox':
        await this.powerOnProxmoxVm(config);
        break;

      // Physical machines
      case 'wol':
        await this.sendWakeOnLan(config);
        break;

      case 'ipmi':
        await this.powerOnIpmi(config);
        break;

      // Generic agent
      case 'agent':
        if (config.powerAgentUrl) {
          await this.callPowerAgent(config.powerAgentUrl, 'start', config.powerAgentToken);
        }
        break;

      default:
        this.logger.warn(`Unknown VM provider: ${config.provider}`);
    }
  }

  /**
   * Power off a VM (for cost savings)
   */
  async powerOffRunner(runner: Runner): Promise<void> {
    const vmConfig = this.getVmConfig(runner);
    if (!vmConfig) return;

    this.logger.log(
      `Powering off VM for runner ${runner.id} (${vmConfig.provider})`,
    );

    switch (vmConfig.provider) {
      // Cloud providers
      case 'azure':
        await this.powerOffAzureVm(vmConfig);
        break;

      case 'aws':
        await this.powerOffAwsVm(vmConfig);
        break;

      case 'gcp':
        await this.powerOffGcpVm(vmConfig);
        break;

      // On-premise virtualization
      case 'vmware':
        await this.powerOffVmwareVm(vmConfig);
        break;

      case 'hyperv':
        await this.powerOffHyperVVm(vmConfig);
        break;

      case 'proxmox':
        await this.powerOffProxmoxVm(vmConfig);
        break;

      // Physical machines - usually don't power off, but could via IPMI
      case 'ipmi':
        await this.powerOffIpmi(vmConfig);
        break;

      // WoL doesn't support power off

      // Generic agent
      case 'agent':
        if (vmConfig.powerAgentUrl) {
          await this.callPowerAgent(vmConfig.powerAgentUrl, 'stop', vmConfig.powerAgentToken);
        }
        break;
    }

    // Update runner status
    runner.status = RunnerStatus.OFFLINE;
    await this.runnerRepository.save(runner);
  }

  /**
   * Get VM/machine config from runner
   * Config can be stored in systemInfo.vmConfig or inferred from labels
   */
  private getVmConfig(runner: Runner): VmConfig | null {
    // VM config could be stored in systemInfo or a dedicated field
    const systemInfo = runner.systemInfo as any;

    if (systemInfo?.vmConfig) {
      return systemInfo.vmConfig;
    }

    // Or infer from labels (useful for simple setups)
    const labels = runner.labels as Record<string, string> | undefined;
    if (labels?.['infra.provider']) {
      const provider = labels['infra.provider'] as InfraProvider;

      return {
        provider,
        // Cloud
        resourceId: labels['infra.resourceId'],
        region: labels['infra.region'],
        // VMware
        vcenterUrl: labels['infra.vcenterUrl'],
        vmPath: labels['infra.vmPath'],
        // Hyper-V
        hypervisorHost: labels['infra.hypervisorHost'],
        vmName: labels['infra.vmName'],
        // Proxmox
        proxmoxUrl: labels['infra.proxmoxUrl'],
        node: labels['infra.node'],
        vmId: labels['infra.vmId'],
        // WoL
        macAddress: labels['infra.macAddress'],
        broadcastAddress: labels['infra.broadcastAddress'],
        // IPMI
        ipmiHost: labels['infra.ipmiHost'],
        ipmiUsername: labels['infra.ipmiUsername'],
        // Agent
        powerAgentUrl: labels['infra.powerAgentUrl'],
        powerAgentToken: labels['infra.powerAgentToken'],
      };
    }

    return null;
  }

  // Azure implementation (placeholder)
  private async powerOnAzureVm(config: VmConfig): Promise<void> {
    // In production, use @azure/arm-compute
    // const computeClient = new ComputeManagementClient(credentials, subscriptionId);
    // await computeClient.virtualMachines.beginStart(resourceGroup, vmName);

    this.logger.log(`[Azure] Would start VM: ${config.resourceId}`);

    // Simulate startup time
    await this.sleep(2000);
  }

  private async powerOffAzureVm(config: VmConfig): Promise<void> {
    this.logger.log(`[Azure] Would stop VM: ${config.resourceId}`);
  }

  // AWS implementation (placeholder)
  private async powerOnAwsVm(config: VmConfig): Promise<void> {
    // In production, use @aws-sdk/client-ec2
    // const ec2 = new EC2Client({ region: config.region });
    // await ec2.send(new StartInstancesCommand({ InstanceIds: [config.resourceId] }));

    this.logger.log(`[AWS] Would start instance: ${config.resourceId}`);
    await this.sleep(2000);
  }

  private async powerOffAwsVm(config: VmConfig): Promise<void> {
    this.logger.log(`[AWS] Would stop instance: ${config.resourceId}`);
  }

  // GCP implementation (placeholder)
  private async powerOnGcpVm(config: VmConfig): Promise<void> {
    this.logger.log(`[GCP] Would start instance: ${config.resourceId}`);
    await this.sleep(2000);
  }

  private async powerOffGcpVm(config: VmConfig): Promise<void> {
    this.logger.log(`[GCP] Would stop instance: ${config.resourceId}`);
  }

  // ============================================
  // On-premise virtualization implementations
  // ============================================

  // VMware vSphere
  private async powerOnVmwareVm(config: VmConfig): Promise<void> {
    // In production, use vsphere-api or govmomi (via agent)
    // POST to vCenter: /rest/vcenter/vm/{vm}/power/start
    this.logger.log(`[VMware] Would start VM: ${config.vmPath} on ${config.vcenterUrl}`);
    await this.sleep(2000);
  }

  private async powerOffVmwareVm(config: VmConfig): Promise<void> {
    this.logger.log(`[VMware] Would stop VM: ${config.vmPath}`);
  }

  // Microsoft Hyper-V
  private async powerOnHyperVVm(config: VmConfig): Promise<void> {
    // In production, call PowerShell via WinRM or agent:
    // Start-VM -Name "vm-name" -ComputerName "hyperv-host"
    this.logger.log(`[Hyper-V] Would start VM: ${config.vmName} on ${config.hypervisorHost}`);
    await this.sleep(2000);
  }

  private async powerOffHyperVVm(config: VmConfig): Promise<void> {
    this.logger.log(`[Hyper-V] Would stop VM: ${config.vmName}`);
  }

  // Proxmox VE
  private async powerOnProxmoxVm(config: VmConfig): Promise<void> {
    // In production, use Proxmox API:
    // POST /api2/json/nodes/{node}/qemu/{vmid}/status/start
    this.logger.log(`[Proxmox] Would start VM ${config.vmId} on node ${config.node}`);
    await this.sleep(2000);
  }

  private async powerOffProxmoxVm(config: VmConfig): Promise<void> {
    this.logger.log(`[Proxmox] Would stop VM ${config.vmId}`);
  }

  // ============================================
  // Physical machine power management
  // ============================================

  // Wake-on-LAN for physical machines
  private async sendWakeOnLan(config: VmConfig): Promise<void> {
    // In production, use wake_on_lan package or send magic packet
    // Magic packet: 6x 0xFF + 16x MAC address
    this.logger.log(`[WoL] Would send magic packet to MAC: ${config.macAddress}`);

    // Example with wake_on_lan:
    // import wol from 'wake_on_lan';
    // wol.wake(config.macAddress, { address: config.broadcastAddress });

    await this.sleep(5000); // WoL machines take longer to boot
  }

  // IPMI/iLO/iDRAC for servers
  private async powerOnIpmi(config: VmConfig): Promise<void> {
    // In production, use ipmitool via child_process or agent:
    // ipmitool -I lanplus -H <host> -U <user> -P <pass> power on
    this.logger.log(`[IPMI] Would power on: ${config.ipmiHost}`);
    await this.sleep(3000);
  }

  private async powerOffIpmi(config: VmConfig): Promise<void> {
    // ipmitool -I lanplus -H <host> -U <user> -P <pass> power soft
    this.logger.log(`[IPMI] Would power off: ${config.ipmiHost}`);
  }

  // ============================================
  // Generic power agent
  // ============================================

  private async callPowerAgent(
    url: string,
    action: 'start' | 'stop',
    token?: string,
  ): Promise<void> {
    this.logger.log(`[Agent] Calling power agent: ${url} action=${action}`);

    // In production:
    // const headers: Record<string, string> = {
    //   'Content-Type': 'application/json',
    // };
    // if (token) {
    //   headers['Authorization'] = `Bearer ${token}`;
    // }
    // await fetch(`${url}/power`, {
    //   method: 'POST',
    //   body: JSON.stringify({ action }),
    //   headers,
    // });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Wait for a runner to come online after power-on
   */
  async waitForRunnerOnline(
    runnerId: string,
    timeoutMs: number = 120000,
  ): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 5000; // Check every 5 seconds

    while (Date.now() - startTime < timeoutMs) {
      const runner = await this.runnerRepository.findOne({
        where: { id: runnerId },
      });

      if (runner?.status === RunnerStatus.ONLINE) {
        this.logger.log(`Runner ${runnerId} is now online`);
        return true;
      }

      await this.sleep(checkInterval);
    }

    this.logger.warn(`Timeout waiting for runner ${runnerId} to come online`);
    return false;
  }
}
