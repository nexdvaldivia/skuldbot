/// <reference types="vite/client" />

declare module 'vite-plugin-obfuscator' {
  import { Plugin } from 'vite';

  interface ObfuscatorOptions {
    include?: (string | RegExp)[];
    exclude?: (string | RegExp)[];
    options?: {
      compact?: boolean;
      controlFlowFlattening?: boolean;
      controlFlowFlatteningThreshold?: number;
      deadCodeInjection?: boolean;
      deadCodeInjectionThreshold?: number;
      debugProtection?: boolean;
      debugProtectionInterval?: number;
      disableConsoleOutput?: boolean;
      identifierNamesGenerator?: string;
      log?: boolean;
      numbersToExpressions?: boolean;
      renameGlobals?: boolean;
      selfDefending?: boolean;
      simplify?: boolean;
      splitStrings?: boolean;
      splitStringsChunkLength?: number;
      stringArray?: boolean;
      stringArrayCallsTransform?: boolean;
      stringArrayCallsTransformThreshold?: number;
      stringArrayEncoding?: string[];
      stringArrayIndexShift?: boolean;
      stringArrayRotate?: boolean;
      stringArrayShuffle?: boolean;
      stringArrayWrappersCount?: number;
      stringArrayWrappersChainedCalls?: boolean;
      stringArrayWrappersParametersMaxCount?: number;
      stringArrayWrappersType?: string;
      stringArrayThreshold?: number;
      transformObjectKeys?: boolean;
      unicodeEscapeSequence?: boolean;
    };
  }

  export default function obfuscatorPlugin(options?: ObfuscatorOptions): Plugin;
}
