import { evaluatePlannerResponse, validateApplyContext } from '../src/store/aiPlannerV2Flow';
import type { ExecutablePlan, ExecutablePlanResponse } from '../src/types/ai-planner';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. expected=${String(expected)} actual=${String(actual)}`);
  }
}

function makePlan(): ExecutablePlan {
  return {
    goal: 'Build invoice bot',
    description: 'Automates invoice extraction and storage',
    assumptions: [],
    unknowns: [],
    tasks: [
      {
        id: 'node-1',
        nodeType: 'trigger.manual',
        label: 'Start',
        description: 'Start flow',
        config: {},
        outputs: { success: 'node-2', error: 'END' },
      },
      {
        id: 'node-2',
        nodeType: 'logging.log',
        label: 'Log',
        description: 'Log run',
        config: { message: 'ok' },
        outputs: { success: 'END', error: 'END' },
      },
    ],
    dsl: { nodes: [] },
    validation: {
      valid: true,
      compilable: true,
      errors: [],
      warnings: [],
    },
  };
}

function run(): void {
  const askResponse: ExecutablePlanResponse = {
    success: true,
    confidence: 1,
    suggestions: [],
    clarifyingQuestions: ['Hola, ¿qué quieres automatizar exactamente?'],
  };
  const askEval = evaluatePlannerResponse('ask', askResponse);
  assertEqual(askEval.kind, 'chat', 'ask mode should stay conversational');
  if (askEval.kind === 'chat') {
    assert(askEval.message.includes('automatizar'), 'ask response should keep clarifying text');
  }

  const planResponse: ExecutablePlanResponse = {
    success: true,
    confidence: 0.7,
    suggestions: [],
    proposedSteps: ['Paso 1', 'Paso 2', 'Paso 3'],
  };
  const planEval = evaluatePlannerResponse('plan', planResponse);
  assertEqual(planEval.kind, 'chat', 'plan mode without plan should return chat text');
  if (planEval.kind === 'chat') {
    assert(planEval.message.includes('Paso 1'), 'plan mode should return proposed steps');
  }

  const generatedPlan = makePlan();
  const generateResponse: ExecutablePlanResponse = {
    success: true,
    confidence: 0.92,
    suggestions: ['Ready to apply'],
    plan: generatedPlan,
  };
  const generateEval = evaluatePlannerResponse('generate', generateResponse);
  assertEqual(generateEval.kind, 'plan', 'generate mode should produce executable plan');
  if (generateEval.kind === 'plan') {
    assertEqual(generateEval.plan.tasks.length, 2, 'generated plan should keep tasks');
    assertEqual(generateEval.suggestions.length, 1, 'generated plan should keep suggestions');
  }

  const applyErrorInvalidTab = validateApplyContext(generatedPlan, {
    currentView: 'project',
    activeBotId: 'bot-1',
    activeTabType: 'project',
  });
  assertEqual(applyErrorInvalidTab, 'Invalid Tab', 'apply should fail outside bot tab');

  const applyErrorNoBot = validateApplyContext(generatedPlan, {
    currentView: 'project',
    activeBotId: null,
    activeTabType: 'bot',
  });
  assertEqual(applyErrorNoBot, 'No Active Bot', 'apply should fail without active bot');

  const applyOk = validateApplyContext(generatedPlan, {
    currentView: 'project',
    activeBotId: 'bot-1',
    activeTabType: 'bot',
  });
  assertEqual(applyOk, null, 'apply should pass with valid context');

  // End-to-end sequence: ask -> plan -> generate -> apply
  let statePlan: ExecutablePlan | null = null;
  if (askEval.kind !== 'error' && planEval.kind !== 'error' && generateEval.kind === 'plan') {
    statePlan = generateEval.plan;
  }
  const finalApply = validateApplyContext(statePlan, {
    currentView: 'project',
    activeBotId: 'bot-1',
    activeTabType: 'bot',
  });
  assertEqual(finalApply, null, 'ask->plan->generate->apply sequence should be applicable');
}

run();
