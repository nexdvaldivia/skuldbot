import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/tauri";
import {
  LicenseModule,
  LicenseInfo,
  LicenseValidationResponse,
} from "../types/ai-planner";
import { useToastStore } from "./toastStore";

// ============================================================
// Module Features Mapping
// ============================================================

/**
 * Maps each license module to its enabled features.
 * This defines what capabilities are unlocked by each module.
 */
const MODULE_FEATURES: Record<LicenseModule, string[]> = {
  studio: [
    "flowEditor",
    "localExecution",
    "projectManagement",
    "170+BaseNodes",
  ],
  skuldai: [
    "aiPlanner",
    "aiRefinement",
    "localLLM",
    "ai.llm_prompt",
    "ai.agent",
    "ai.extract_data",
    "ai.summarize",
    "ai.classify",
    "ai.translate",
    "ai.sentiment",
    "ai.vision",
    "ai.embeddings",
  ],
  skuldcompliance: [
    "compliance.protect_pii",
    "compliance.protect_phi",
    "compliance.audit_log",
  ],
  skulddataquality: [
    "dataquality.validate",
    "dataquality.profile_data",
    "dataquality.generate_report",
    "ai.repair_data",
    "ai.suggest_repairs",
  ],
};

/**
 * Node types that require specific licenses.
 * Any node not listed here is available with base Studio license.
 */
const NODE_LICENSE_REQUIREMENTS: Record<string, LicenseModule> = {
  // AI nodes require SkuldAI
  "ai.llm_prompt": "skuldai",
  "ai.agent": "skuldai",
  "ai.extract_data": "skuldai",
  "ai.summarize": "skuldai",
  "ai.classify": "skuldai",
  "ai.translate": "skuldai",
  "ai.sentiment": "skuldai",
  "ai.vision": "skuldai",
  "ai.embeddings": "skuldai",

  // Compliance nodes require SkuldCompliance
  "compliance.protect_pii": "skuldcompliance",
  "compliance.protect_phi": "skuldcompliance",
  "compliance.audit_log": "skuldcompliance",

  // Data Quality nodes require SkuldDataQuality
  "dataquality.validate": "skulddataquality",
  "dataquality.profile_data": "skulddataquality",
  "dataquality.generate_report": "skulddataquality",
  "ai.repair_data": "skulddataquality",
  "ai.suggest_repairs": "skulddataquality",
};

// ============================================================
// License Store State
// ============================================================

interface LicenseStoreState {
  // Active licenses (can have multiple modules)
  activeLicenses: LicenseInfo[];

  // Enabled features (derived from active modules)
  enabledFeatures: Set<string>;

  // Loading state
  isValidating: boolean;

  // Last validation timestamp
  lastValidated: string | null;

  // Actions
  activateLicense: (key: string) => Promise<{ success: boolean; module?: LicenseModule; error?: string }>;
  validateAllLicenses: () => Promise<void>;
  deactivateLicense: (module: LicenseModule) => void;
  hasModule: (module: LicenseModule) => boolean;
  hasFeature: (feature: string) => boolean;
  canUseNode: (nodeType: string) => boolean;
  isStudioActivated: () => boolean;
  getActivatedModules: () => LicenseModule[];

  // Internal
  _updateEnabledFeatures: () => void;
}

// ============================================================
// License Store
// ============================================================

export const useLicenseStore = create<LicenseStoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      activeLicenses: [],
      enabledFeatures: new Set<string>(),
      isValidating: false,
      lastValidated: null,

      // ============================================================
      // License Activation
      // ============================================================

      activateLicense: async (key: string) => {
        const toast = useToastStore.getState();
        set({ isValidating: true });

        try {
          // Check for dev all-access key
          const keyUpper = key.toUpperCase();
          const isDevKey = keyUpper === "DEV-ALL-ACCESS" || keyUpper === "KHIPUS-DEV-2024";

          // Call Tauri backend to validate license with server
          const response = await invoke<LicenseValidationResponse>("validate_license", {
            licenseKey: key,
          });

          if (!response.valid) {
            set({ isValidating: false });
            toast.error("Invalid License", response.error || "License key is invalid or expired");
            return { success: false, error: response.error || "Invalid license key" };
          }

          // For dev key, activate ALL modules at once
          if (isDevKey) {
            const allModules: LicenseModule[] = ["studio", "skuldai", "skuldcompliance", "skulddataquality"];
            const devLicenses: LicenseInfo[] = allModules.map((module) => ({
              module,
              licenseKey: key,
              expiresAt: response.expiresAt,
              isValid: true,
            }));

            set({
              activeLicenses: devLicenses,
              isValidating: false,
              lastValidated: new Date().toISOString(),
            });

            get()._updateEnabledFeatures();

            toast.success(
              "Dev License Activated",
              "All modules activated for development"
            );

            return { success: true, module: "studio" as LicenseModule };
          }

          // Add to active licenses
          const newLicense: LicenseInfo = {
            module: response.module,
            licenseKey: key,
            expiresAt: response.expiresAt,
            isValid: true,
          };

          const { activeLicenses } = get();

          // Replace if same module exists, otherwise add
          const existingIndex = activeLicenses.findIndex((l) => l.module === response.module);
          let newLicenses: LicenseInfo[];

          if (existingIndex >= 0) {
            newLicenses = [...activeLicenses];
            newLicenses[existingIndex] = newLicense;
          } else {
            newLicenses = [...activeLicenses, newLicense];
          }

          set({
            activeLicenses: newLicenses,
            isValidating: false,
            lastValidated: new Date().toISOString(),
          });

          // Update enabled features
          get()._updateEnabledFeatures();

          toast.success(
            "License Activated",
            `${response.module.charAt(0).toUpperCase() + response.module.slice(1)} module activated`
          );

          return { success: true, module: response.module };
        } catch (error) {
          console.error("Failed to activate license:", error);
          set({ isValidating: false });
          toast.error("Activation Failed", String(error));
          return { success: false, error: String(error) };
        }
      },

      // ============================================================
      // License Validation
      // ============================================================

      validateAllLicenses: async () => {
        const { activeLicenses } = get();

        if (activeLicenses.length === 0) {
          return;
        }

        set({ isValidating: true });

        const updatedLicenses: LicenseInfo[] = [];

        for (const license of activeLicenses) {
          try {
            const response = await invoke<LicenseValidationResponse>("validate_license", {
              licenseKey: license.licenseKey,
            });

            updatedLicenses.push({
              ...license,
              isValid: response.valid,
              expiresAt: response.expiresAt,
            });
          } catch {
            // If validation fails (e.g., offline), keep license as-is
            // but mark for re-validation
            updatedLicenses.push({
              ...license,
              isValid: license.isValid, // Keep previous status when offline
            });
          }
        }

        set({
          activeLicenses: updatedLicenses,
          isValidating: false,
          lastValidated: new Date().toISOString(),
        });

        get()._updateEnabledFeatures();
      },

      // ============================================================
      // License Deactivation
      // ============================================================

      deactivateLicense: (module: LicenseModule) => {
        const { activeLicenses } = get();
        const toast = useToastStore.getState();

        const newLicenses = activeLicenses.filter((l) => l.module !== module);

        set({ activeLicenses: newLicenses });
        get()._updateEnabledFeatures();

        toast.info("License Deactivated", `${module} module has been deactivated`);
      },

      // ============================================================
      // License Queries
      // ============================================================

      hasModule: (module: LicenseModule) => {
        const { activeLicenses } = get();
        return activeLicenses.some((l) => l.module === module && l.isValid);
      },

      hasFeature: (feature: string) => {
        const { enabledFeatures } = get();
        return enabledFeatures.has(feature);
      },

      canUseNode: (nodeType: string) => {
        const { hasModule } = get();

        // First check if Studio is activated (base requirement)
        if (!hasModule("studio")) {
          return false;
        }

        // Check if node requires specific license
        const requiredModule = NODE_LICENSE_REQUIREMENTS[nodeType];

        if (!requiredModule) {
          // Node doesn't require special license, Studio is enough
          return true;
        }

        // Check if required module is activated
        return hasModule(requiredModule);
      },

      isStudioActivated: () => {
        return get().hasModule("studio");
      },

      getActivatedModules: () => {
        const { activeLicenses } = get();
        return activeLicenses
          .filter((l) => l.isValid)
          .map((l) => l.module);
      },

      // ============================================================
      // Internal
      // ============================================================

      _updateEnabledFeatures: () => {
        const { activeLicenses } = get();
        const features = new Set<string>();

        for (const license of activeLicenses) {
          if (license.isValid) {
            const moduleFeatures = MODULE_FEATURES[license.module] || [];
            moduleFeatures.forEach((f) => features.add(f));
          }
        }

        set({ enabledFeatures: features });
      },
    }),
    {
      name: "skuldbot-licenses",
      // Custom serialization to handle Set
      partialize: (state) => ({
        activeLicenses: state.activeLicenses,
        lastValidated: state.lastValidated,
      }),
      // Rehydrate enabled features after loading from storage
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._updateEnabledFeatures();
        }
      },
    }
  )
);

// ============================================================
// Helper Hooks
// ============================================================

/**
 * Hook to check if AI Planner feature is available
 */
export const useCanUseAIPlanner = () => {
  const hasFeature = useLicenseStore((state) => state.hasFeature);
  return hasFeature("aiPlanner");
};

/**
 * Hook to check if a specific node type can be used
 */
export const useCanUseNode = (nodeType: string) => {
  const canUseNode = useLicenseStore((state) => state.canUseNode);
  return canUseNode(nodeType);
};

/**
 * Hook to get license status for display
 */
export const useLicenseStatus = () => {
  const activeLicenses = useLicenseStore((state) => state.activeLicenses);
  const isStudioActivated = useLicenseStore((state) => state.isStudioActivated);
  const getActivatedModules = useLicenseStore((state) => state.getActivatedModules);

  return {
    isActivated: isStudioActivated(),
    modules: getActivatedModules(),
    licenses: activeLicenses,
    hasAI: activeLicenses.some((l) => l.module === "skuldai" && l.isValid),
    hasCompliance: activeLicenses.some((l) => l.module === "skuldcompliance" && l.isValid),
    hasDataQuality: activeLicenses.some((l) => l.module === "skulddataquality" && l.isValid),
  };
};

/**
 * Get the required license module for a node type
 */
export const getRequiredLicenseForNode = (nodeType: string): LicenseModule | null => {
  return NODE_LICENSE_REQUIREMENTS[nodeType] || null;
};
