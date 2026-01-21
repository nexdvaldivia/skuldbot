'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  botsApi,
  runsApi,
  runnersApi,
  schedulesApi,
  type Bot,
  type Run,
  type Runner,
  type Schedule,
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

export function useDeleteRunner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runnersApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runners'] });
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

export function useTriggerSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: schedulesApi.trigger,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });
}
