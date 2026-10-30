/** DESK DK3 — public detect API. Importing this registers the built-in detectors. */
import { registerDetector } from "./registry";
import { sampleDetector } from "./sampleDetector";
import { referenceDetector } from "./levels/referenceDetector";
import { fvgDetector } from "./fvg/fvgDetector";
import { srDetector } from "./levels/srDetector";
import { structureDetector } from "./structure/structureDetector";
import { liquidityDetector } from "./liquidity/liquidityDetector";
import { sdDetector } from "./sd/sdDetector";
import { paDetector } from "./pa/paDetector";

// Structure first: its labelled swings share ids with the sample detector's and win the de-dupe.
registerDetector(structureDetector);
registerDetector(srDetector);
registerDetector(referenceDetector);
registerDetector(fvgDetector);
registerDetector(liquidityDetector);
registerDetector(sdDetector);
registerDetector(paDetector);
registerDetector(sampleDetector);

export * from "./registry";
export { buildRelations } from "./relations";
export { useAnalysisStore } from "./analysisStore";
export { nearestFvgs } from "./fvg/nearest";
export { analyzeStructure } from "./structure/analyze";
export { bestTrendlines } from "./pa/trendlines";
export { marketClass } from "./pa/range";
export { confirmedRange, rangeFraction } from "./pa/premium";