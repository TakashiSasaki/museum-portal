(() => {
  'use strict';

  const IMAGINEDECK_SIGNATURE_PARALLEL_VERSION = 42;

  // Promise.all preserves the input order, so this keeps the canonical
  // generation signature while avoiding twelve serialized validator probes
  // around each complete-set fetch.
  readServerGenerationSignature = async function readServerGenerationSignatureV42() {
    const signatures = await Promise.all(
      [...ATOMIC_IMAGINEDECK_ASSET_PATHS].map(serverAssetSignature)
    );
    return signatures.join('\n');
  };

  self.__IMAGINEDECK_SW_SIGNATURE_PARALLEL_VERSION__ =
    IMAGINEDECK_SIGNATURE_PARALLEL_VERSION;
})();
