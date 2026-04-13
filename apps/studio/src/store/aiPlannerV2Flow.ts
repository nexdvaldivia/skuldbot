import type { ExecutablePlan, ExecutablePlanResponse, PlannerAgentMode } from '../types/ai-planner';

export interface PlannerApplyContext {
  currentView: string;
  activeBotId: string | null;
  activeTabType: string | null;
}

export type PlannerResponseEvaluation =
  | {
      kind: 'plan';
      message: string;
      plan: ExecutablePlan;
      confidence: number;
      suggestions: string[];
      requiresClarification: boolean;
    }
  | {
      kind: 'chat';
      message: string;
    }
  | {
      kind: 'error';
      error: string;
    };

export function buildPlanResponseText(plan: ExecutablePlan, confidence: number): string {
  if (plan.unknowns && plan.unknowns.length > 0) {
    let text = 'I need some clarification before I can create a complete workflow:\n\n';
    plan.unknowns.forEach((unknown, i) => {
      text += `${i + 1}. ${unknown.question}`;
      if (unknown.context) {
        text += ` (${unknown.context})`;
      }
      text += '\n';
    });
    text += '\nPlease provide these details so I can generate an accurate workflow.';
    return text;
  }

  let text = `I've created a ${plan.tasks.length}-step workflow for "${plan.goal}".\n\n`;
  text += `**Confidence:** ${(confidence * 100).toFixed(0)}% ${confidence >= 0.8 ? '(High)' : confidence >= 0.5 ? '(Medium)' : '(Low)'}\n`;
  text += `**Status:** ${plan.validation.valid && plan.validation.compilable ? '✓ Valid and compilable' : '⚠️ Has issues'}\n\n`;

  if (plan.assumptions.length > 0) {
    text += '**Assumptions:**\n';
    plan.assumptions.forEach((assumption) => {
      text += `• ${assumption}\n`;
    });
    text += '\n';
  }

  if (plan.validation.errors.length > 0) {
    text += `**Errors:** ${plan.validation.errors.length}\n`;
  }
  if (plan.validation.warnings.length > 0) {
    text += `**Warnings:** ${plan.validation.warnings.length}\n`;
  }

  text +=
    '\nCheck the Preview and Validation tabs for details. Would you like me to adjust anything?';
  return text;
}

export function evaluatePlannerResponse(
  mode: PlannerAgentMode,
  response: ExecutablePlanResponse,
): PlannerResponseEvaluation {
  if (!response.success) {
    return {
      kind: 'error',
      error: response.error || 'Failed to generate response',
    };
  }

  if (response.plan) {
    const confidence = response.confidence || 0;
    return {
      kind: 'plan',
      message: buildPlanResponseText(response.plan, confidence),
      plan: response.plan,
      confidence,
      suggestions: response.suggestions || [],
      requiresClarification:
        !!response.clarifyingQuestions && response.clarifyingQuestions.length > 0,
    };
  }

  if (mode === 'ask' || mode === 'plan') {
    if (response.clarifyingQuestions && response.clarifyingQuestions.length > 0) {
      return { kind: 'chat', message: response.clarifyingQuestions.join('\n\n') };
    }
    if (response.proposedSteps && response.proposedSteps.length > 0) {
      return { kind: 'chat', message: response.proposedSteps.join('\n\n') };
    }
    return { kind: 'chat', message: 'Ready to help. What would you like to automate?' };
  }

  return { kind: 'error', error: 'No plan generated. Please try again.' };
}

export function validateApplyContext(
  plan: ExecutablePlan | null,
  context: PlannerApplyContext,
): string | null {
  if (!plan) {
    return 'No Plan';
  }

  if (!plan.validation.valid || !plan.validation.compilable) {
    return 'Invalid Plan';
  }

  if (context.currentView !== 'project') {
    return 'Invalid Context';
  }

  if (!context.activeBotId) {
    return 'No Active Bot';
  }

  if (context.activeTabType !== 'bot') {
    return 'Invalid Tab';
  }

  return null;
}
