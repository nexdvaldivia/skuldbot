'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  botsApi,
  runsApi,
  runnersApi,
  schedulesApi,
  usersApi,
  rolesApi,
  auditApi,
  settingsApi,
  ssoApi,
  type Bot,
  type Run,
  type Runner,
  type Schedule,
  type RegisterRunnerRequest,
  type InviteUserRequest,
  type ListUsersParams,
  type UserStatus,
  type OrchestratorUser,
  type Role,
  type CreateRoleRequest,
  type PermissionsByCategory,
  type ListAuditLogsParams,
  type TenantSettings,
  type UpdateTenantSettingsRequest,
  type OrchestratorSsoConfig,
} from '@/lib/api';

// ============================================
// Bots
// ============================================

export function useBots() {
  return useQuery({
    queryKey: ['bots'],
    queryFn: botsApi.list,
  });
}

export function useBot(id: string) {
  return useQuery({
    queryKey: ['bots', id],
    queryFn: () => botsApi.get(id),
    enabled: !!id,
  });
}

export function useCreateBot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: botsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bots'] });
    },
  });
}

export function useDeleteBot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: botsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bots'] });
    },
  });
}

// ============================================
// Runs
// ============================================

export function useRuns() {
  return useQuery({
    queryKey: ['runs'],
    queryFn: runsApi.list,
  });
}

export function useRun(id: string) {
  return useQuery({
    queryKey: ['runs', id],
    queryFn: () => runsApi.get(id),
    enabled: !!id,
  });
}

export function useRunStats() {
  return useQuery({
    queryKey: ['runs', 'stats'],
    queryFn: runsApi.getStats,
  });
}

export function useCancelRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runsApi.cancel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      queryClient.invalidateQueries({ queryKey: ['runs', 'stats'] });
    },
  });
}

// ============================================
// Runners
// ============================================

export function useRunners() {
  return useQuery({
    queryKey: ['runners'],
    queryFn: runnersApi.list,
  });
}

export function useRunner(id: string) {
  return useQuery({
    queryKey: ['runners', id],
    queryFn: () => runnersApi.get(id),
    enabled: !!id,
  });
}

export function useRunnerStats() {
  return useQuery({
    queryKey: ['runners', 'stats'],
    queryFn: runnersApi.getStats,
  });
}

export function useCreateRunner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RegisterRunnerRequest) => runnersApi.register(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runners'] });
      queryClient.invalidateQueries({ queryKey: ['runners', 'stats'] });
    },
  });
}

export function useRegenerateRunnerKey() {
  return useMutation({
    mutationFn: (id: string) => runnersApi.regenerateKey(id),
  });
}

export function useDeleteRunner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runnersApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runners'] });
      queryClient.invalidateQueries({ queryKey: ['runners', 'stats'] });
    },
  });
}

// ============================================
// Schedules
// ============================================

export function useSchedules() {
  return useQuery({
    queryKey: ['schedules'],
    queryFn: schedulesApi.list,
  });
}

export function useSchedule(id: string) {
  return useQuery({
    queryKey: ['schedules', id],
    queryFn: () => schedulesApi.get(id),
    enabled: !!id,
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: schedulesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: schedulesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });
}

export function useDisableSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      schedulesApi.disable(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });
}

export function useActivateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Schedule['status'] }) => {
      if (status === 'paused') {
        return schedulesApi.resume(id);
      }
      return schedulesApi.activate(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });
}

export function useTriggerSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: schedulesApi.trigger,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      queryClient.invalidateQueries({ queryKey: ['runs', 'stats'] });
    },
  });
}

// ============================================
// Users / Roles
// ============================================

export function useUsers(params?: ListUsersParams) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => usersApi.list(params),
  });
}

export function useRoles(params?: {
  search?: string;
  type?: 'system' | 'custom';
  includePermissions?: boolean;
  includeUserCount?: boolean;
}) {
  return useQuery({
    queryKey: ['roles', params],
    queryFn: () => rolesApi.list(params),
  });
}

export function useRolePermissions() {
  return useQuery({
    queryKey: ['roles', 'permissions'],
    queryFn: rolesApi.getPermissions,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRoleRequest) => rolesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rolesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useInviteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: InviteUserRequest) => usersApi.invite(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: UserStatus; reason?: string }) =>
      usersApi.updateStatus(id, { status, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useResendInvite() {
  return useMutation({
    mutationFn: (id: string) => usersApi.resendInvite(id),
  });
}

// ============================================
// Audit / Settings
// ============================================

export function useAuditLogs(params?: ListAuditLogsParams) {
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => auditApi.list(params),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateTenantSettingsRequest) => settingsApi.update(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

export function useSsoConfig() {
  return useQuery({
    queryKey: ['sso', 'config'],
    queryFn: ssoApi.getConfig,
  });
}

// keep type exports available to UI pages
export type {
  Bot,
  Run,
  Runner,
  Schedule,
  OrchestratorUser,
  Role,
  PermissionsByCategory,
  TenantSettings,
  OrchestratorSsoConfig,
};
